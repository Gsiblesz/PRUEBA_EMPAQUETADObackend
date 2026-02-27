const express = require('express');
const { Pool } = require('pg');
const cors = require('cors');

const app = express();
const port = 3000;

// Middleware
app.use(cors()); // Enable CORS for all routes
app.use(express.json());

// Neon Database Configuration
const pool = new Pool({
  connectionString: 'postgresql://neondb_owner:npg_cItDZuB28YiV@ep-plain-brook-ai9et1i0-pooler.c-4.us-east-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require',
  ssl: {
    rejectUnauthorized: false,
  },
});

// Generic endpoint to get a catalog table
async function getCatalog(req, res, tableName) {
  try {
    const client = await pool.connect();
    const result = await client.query(`SELECT * FROM ${tableName} ORDER BY nombre`);
    client.release();
    res.status(200).json(result.rows);
  } catch (error) {
    console.error(`Error fetching ${tableName}:`, error);
    res.status(500).json({ error: `Error fetching ${tableName} from the database` });
  }
}

// Catalog routes
app.get('/destinos', (req, res) => getCatalog(req, res, 'destinos'));
app.get('/sedes', (req, res) => getCatalog(req, res, 'sedes'));
app.get('/responsables', (req, res) => getCatalog(req, res, 'responsables'));

app.get('/productos', async (req, res) => {
    try {
        const client = await pool.connect();
        const result = await client.query('SELECT * FROM productos ORDER BY nombre_producto');
        client.release();
        res.status(200).json(result.rows);
    } catch (error) {
        console.error('Error fetching productos:', error);
        res.status(500).json({ error: 'Error fetching productos from the database' });
    }
});


// Endpoint to add a product
app.post('/productos', async (req, res) => {
  const { codigo_producto, nombre_producto, paquetes_por_cesta, adminKey } = req.body;

  if (!codigo_producto || !nombre_producto || !paquetes_por_cesta) {
    return res.status(400).json({ error: 'Faltan campos obligatorios: codigo_producto, nombre_producto, paquetes_por_cesta' });
  }

  if (adminKey !== 'PASANTIAS90') {
    return res.status(403).json({ error: 'adminKey inválido' });
  }

  try {
    const client = await pool.connect();

    // Check if the product already exists
    const existing = await client.query('SELECT * FROM productos WHERE LOWER(codigo_producto) = LOWER()', [codigo_producto]);
    if (existing.rows.length > 0) {
      client.release();
      return res.status(409).json({ error: 'Código de producto ya existe' });
    }

    // Insert the new product
    const insertQuery = 'INSERT INTO productos (codigo_producto, nombre_producto, paquetes_por_cesta) VALUES (, $2, $3) RETURNING *';
    const result = await client.query(insertQuery, [codigo_producto, nombre_producto, paquetes_por_cesta]);

    client.release();
    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error('Error adding product:', error);
    res.status(500).json({ error: 'Error al agregar el producto' });
  }
});


// Endpoint to create a new empaquetado record
app.post('/empaquetados', async (req, res) => {
  const { cabecera, detalle } = req.body;

  if (!cabecera || !detalle || !Array.isArray(detalle) || detalle.length === 0) {
    return res.status(400).json({ error: 'La solicitud debe contener un objeto "cabecera" y un array no vacío de "detalle"' });
  }

  const { fecha_hora, id_destino, numero_registro, id_responsable, id_sede } = cabecera;

  if (!fecha_hora || !id_destino || !id_responsable || !id_sede) {
      return res.status(400).json({ error: 'Faltan campos obligatorios en la cabecera' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Insert header
    const cabeceraQuery = `
      INSERT INTO empaquetados_cabecera (fecha_hora, id_destino, numero_registro, id_responsable, id_sede)
      VALUES (, $2, $3, $4, $5)
      RETURNING id_cabecera;
    `;
    const cabeceraValues = [fecha_hora, id_destino, numero_registro, id_responsable, id_sede];
    const cabeceraResult = await client.query(cabeceraQuery, cabeceraValues);
    const id_cabecera = cabeceraResult.rows[0].id_cabecera;

    // Insert details
    const detalleQuery = `
      INSERT INTO empaquetados_detalle (id_cabecera, id_producto, cantidad, numero_lote)
      VALUES (, $2, $3, $4);
    `;
    for (const item of detalle) {
      const { id_producto, cantidad, numero_lote } = item;
      if (!id_producto || !cantidad || !numero_lote) {
        throw new Error('Cada item del detalle debe tener id_producto, cantidad y numero_lote.');
      }
      const detalleValues = [id_cabecera, id_producto, cantidad, numero_lote];
      await client.query(detalleQuery, detalleValues);
    }

    await client.query('COMMIT');
    res.status(201).json({ message: 'Registro de empaquetado creado exitosamente', id_cabecera });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error en transacción de empaquetado', error);
    res.status(500).json({ error: 'Error al registrar el empaquetado', details: error.message });
  } finally {
    client.release();
  }
});

/*
// Endpoint to fetch and display records (To be implemented based on frontend needs)
app.get('/registros', async (req, res) => {
  try {
    const client = await pool.connect();
    // Example: Fetch headers with responsible and location names
    const result = await client.query(`
        SELECT ec.*, r.nombre_completo as responsable, s.nombre as sede
        FROM empaquetados_cabecera ec
        JOIN responsables r ON ec.id_responsable = r.id_responsable
        JOIN sedes s ON ec.id_sede = s.id_sede
        ORDER BY ec.fecha_hora DESC
    `);
    client.release();

    res.status(200).json(result.rows);
  } catch (error) {
    console.error('Error fetching records:', error);
    res.status(500).json({ error: 'Error fetching records from the database' });
  }
});
*/

// Health check endpoint
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'OK', message: 'Server is healthy' });
});

// Start Server
app.listen(port, () => {
  console.log(`Server running on http://localhost:${port}`);
});