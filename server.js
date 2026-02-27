const express = require('express');
const cors = require('cors');
const { Pool } = require('pg');

const app = express();
const port = process.env.PORT || 10000;

// Configuración de middlewares
app.use(cors());
app.use(express.json());

// Configuración de la conexión a la base de datos Neon (usando la variable de entorno segura)
const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: {
        rejectUnauthorized: false
    }
});

// Probar conexión a la base de datos al iniciar el servidor
pool.connect((err, client, release) => {
    if (err) {
        return console.error('❌ Error al adquirir el cliente de la base de datos:', err.stack);
    }
    console.log('✅ ¡Conexión exitosa a la base de datos Neon!');
    release();
});

// ==========================================
// 1. RUTAS DE DIAGNÓSTICO
// ==========================================
app.get('/health', (req, res) => {
    res.status(200).send('El servidor está corriendo perfectamente');
});


// ==========================================
// 2. RUTAS GET (Catálogos y Productos)
// ==========================================

// Función genérica para obtener catálogos (ahora es inteligente y acepta la columna para ordenar)
async function getCatalog(req, res, tableName, orderByCol = 'nombre') {
    try {
        const client = await pool.connect();
        const result = await client.query(`SELECT * FROM ${tableName} ORDER BY ${orderByCol}`);
        client.release();
        res.status(200).json(result.rows);
    } catch (error) {
        console.error(`Error fetching ${tableName}:`, error);
        res.status(500).json({ error: `Error obteniendo la tabla ${tableName}` });
    }
}

// Catálogos simples
app.get('/destinos', (req, res) => getCatalog(req, res, 'destinos', 'nombre'));
app.get('/sedes', (req, res) => getCatalog(req, res, 'sedes', 'nombre'));

// Catálogo de responsables (Corregido: Usa 'nombre_completo' en lugar de 'nombre')
app.get('/responsables', (req, res) => getCatalog(req, res, 'responsables', 'nombre_completo'));

// Catálogo de productos (Ordenado por descripción)
app.get('/productos', async (req, res) => {
    try {
        const client = await pool.connect();
        const result = await client.query('SELECT * FROM productos ORDER BY descripcion');
        client.release();
        res.status(200).json(result.rows);
    } catch (error) {
        console.error('Error fetching productos:', error);
        res.status(500).json({ error: 'Error obteniendo productos' });
    }
});


// ==========================================
// 3. RUTAS POST (Guardar datos)
// ==========================================

// Ruta para registrar un nuevo Empaquetado
app.post('/empaquetados', async (req, res) => {
    const { cabecera, detalle } = req.body;

    // Validación básica de seguridad
    if (!cabecera || !detalle || detalle.length === 0) {
        return res.status(400).json({ error: 'Faltan datos de cabecera o detalle.' });
    }

    const client = await pool.connect();

    try {
        await client.query('BEGIN'); // Iniciar transacción segura

        // 1. Insertar Cabecera
        const insertCabeceraQuery = `
            INSERT INTO cabecera_empaquetados (fecha_hora, id_destino, numero_registro, id_responsable, id_sede)
            VALUES ($1, $2, $3, $4, $5)
            RETURNING id_cabecera_empaquetado;
        `;
        const cabeceraValues = [
            cabecera.fecha_hora,
            cabecera.id_destino,
            cabecera.numero_registro || null,
            cabecera.id_responsable,
            cabecera.id_sede
        ];

        const resCabecera = await client.query(insertCabeceraQuery, cabeceraValues);
        const idCabecera = resCabecera.rows[0].id_cabecera_empaquetado;

        // 2. Insertar Detalle (Productos)
        const insertDetalleQuery = `
            INSERT INTO detalle_empaquetados (id_cabecera_empaquetado, id_producto, cantidad, numero_lote)
            VALUES ($1, $2, $3, $4);
        `;

        for (let item of detalle) {
            await client.query(insertDetalleQuery, [
                idCabecera,
                item.id_producto,
                item.cantidad,
                item.numero_lote || 'SIN LOTE'
            ]);
        }

        await client.query('COMMIT'); // Confirmar y guardar permanentemente
        console.log(`✅ Empaquetado registrado con éxito. ID Cabecera: ${idCabecera}`);
        res.status(201).json({ message: 'Empaquetado registrado con éxito', idCabecera });

    } catch (error) {
        await client.query('ROLLBACK'); // Revertir todo si hay un error para no dejar datos a medias
        console.error('Error en transacción de empaquetados:', error);
        res.status(500).json({ error: 'Error interno del servidor al guardar en la base de datos' });
    } finally {
        client.release();
    }
});


// ==========================================
// 4. ENCENDER EL SERVIDOR
// ==========================================
app.listen(port, () => {
    console.log(`🚀 Servidor backend corriendo en el puerto ${port}`);
});
