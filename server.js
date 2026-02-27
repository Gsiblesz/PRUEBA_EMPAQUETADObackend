const express = require('express');
const { Pool } = require('pg');
const cors = require('cors');

const app = express();
// Render asigna un puerto dinámico, por eso usamos process.env.PORT
const port = process.env.PORT || 3000; 

// Middleware
app.use(cors()); 
app.use(express.json());

// 1. Configuración Segura de Neon
const pool = new Pool({
  connectionString: process.env.DATABASE_URL, // Render inyectará tu URL secreta aquí
  ssl: {
    rejectUnauthorized: false,
  },
});

// Probar conexión al arrancar
pool.connect((err, client, release) => {
  if (err) {
    console.error('❌ Error conectando a Neon:', err.stack);
  } else {
    console.log('✅ ¡Conexión exitosa a la base de datos Neon!');
    release();
  }
});

// 2. Función genérica para los catálogos (¡Buena idea de tu compañero!)
async function getCatalog(req, res, tableName) {
  try {
    const client = await pool.connect();
    const result = await client.query(`SELECT * FROM ${tableName} ORDER BY nombre`);
    client.release();
    res.status(200).json(result.rows);
  } catch (error) {
    console.error(`Error fetching ${tableName}:`, error);
    res.status(500).json({ error: `Error obteniendo ${tableName}` });
  }
}

// 3. Rutas GET (Catálogos y Productos)
app.get('/destinos', (req, res) => getCatalog(req, res, 'destinos'));
app.get('/sedes', (req, res) => getCatalog(req, res, 'sedes'));
app.get('/responsables', (req, res) => getCatalog(req, res, 'responsables'));

app.get('/productos', async (req, res) => {
    try {
        const client = await pool.connect();
        // Corregido: En tu BD la columna se llama 'descripcion', no 'nombre_producto'
        const result = await client.query('SELECT * FROM productos ORDER BY descripcion');
        client.release();
        res.status(200).json(result.rows);
    } catch (error) {
        console.error('Error fetching productos:', error);
        res.status(500).json({ error: 'Error obteniendo productos' });
    }
});

// 4. Ruta POST para registrar empaquetados (Transacción Master-Detalle)
app.post('/empaquetados', async (req, res) => {
  const { cabecera, detalle } = req.body;

  if (!cabecera || !detalle || !Array.isArray(detalle) || detalle.length === 0) {
    return res.status(400).json({ error: 'Faltan datos en cabecera o detalle.' });
  }

  const { fecha_hora, id_destino, numero_registro, id_responsable, id_sede } = cabecera;

  if (!fecha_hora || !id_destino || !id_responsable || !id_sede) {
      return res.status(400).json({ error: 'Faltan campos obligatorios en la cabecera' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN'); // Inicia la transacción

    // Insertar Cabecera (Corregido el error del $1 faltante)
    const cabeceraQuery = `
      INSERT INTO empaquetados_cabecera (fecha_hora, id_destino, numero_registro, id_responsable, id_sede)
      VALUES ($1, $2, $3, $4, $5)
      RETURNING id_cabecera;
    `;
    const cabeceraValues = [fecha_hora, id_destino, numero_registro, id_responsable, id_sede];
    const cabeceraResult = await client.query(cabeceraQuery, cabeceraValues);
    const id_cabecera = cabeceraResult.rows[0].id_cabecera;

    // Insertar Detalle (Corregido el error del $1 faltante)
    const detalleQuery = `
      INSERT INTO empaquetados_detalle (id_cabecera, id_producto, cantidad, numero_lote)
      VALUES ($1, $2, $3, $4);
    `;
    
    for (const item of detalle) {
      const { id_producto, cantidad, numero_lote } = item;
      if (!id_producto || !cantidad || !numero_lote) {
        throw new Error('Cada item del detalle debe tener id_producto, cantidad y numero_lote.');
      }
      const detalleValues = [id_cabecera, id_producto, cantidad, numero_lote];
      await client.query(detalleQuery, detalleValues);
    }

    await client.query('COMMIT'); // Guarda todo definitivamente
    res.status(201).json({ message: 'Empaquetado registrado exitosamente', id_cabecera });
  } catch (error) {
    await client.query('ROLLBACK'); // Si algo falla, deshace todo
    console.error('Error en transacción:', error);
    res.status(500).json({ error: 'Error al registrar el empaquetado', details: error.message });
  } finally {
    client.release();
  }
});

// Ruta de diagnóstico
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'OK', message: 'El servidor está corriendo perfectamente' });
});

// 5. Iniciar Servidor
app.listen(port, () => {
  console.log(`🚀 Servidor backend corriendo en el puerto ${port}`);
});


