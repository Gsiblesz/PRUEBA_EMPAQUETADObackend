const express = require('express');
const { Pool } = require('pg');
const app = express();
const port = 3000;

// Middleware
app.use(express.json());

// Neon Database Configuration
const pool = new Pool({
  connectionString: 'postgresql://neondb_owner:npg_cItDZuB28YiV@ep-plain-brook-ai9et1i0-pooler.c-4.us-east-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require',
  ssl: {
    rejectUnauthorized: false,
  },
});

// Routes
app.post('/nuevo-lote', async (req, res) => {
  const { productos, codigo_lote } = req.body;

  if (!productos || !Array.isArray(productos) || productos.length === 0) {
    return res.status(400).json({ error: 'Invalid product data' });
  }

  try {
    const client = await pool.connect();

    try {
      await client.query('BEGIN');

      for (const producto of productos) {
        const { codigo, descripcion, cantidad, paquetes, sobre_piso, lote } = producto;
        await client.query(
          'INSERT INTO productos (codigo, descripcion, cantidad, paquetes, sobre_piso, lote, codigo_lote) VALUES ($1, $2, $3, $4, $5, $6, $7)',
          [codigo, descripcion, cantidad, paquetes, sobre_piso, lote, codigo_lote]
        );
      }

      await client.query('COMMIT');
      res.status(201).json({ message: 'Lote registrado exitosamente' });
    } catch (error) {
      await client.query('ROLLBACK');
      console.error('Error during transaction', error);
      res.status(500).json({ error: 'Error al registrar el lote' });
    } finally {
      client.release();
    }
  } catch (error) {
    console.error('Database connection error', error);
    res.status(500).json({ error: 'Error de conexión a la base de datos' });
  }
});

// Endpoint to fetch and display records
app.get('/registros', async (req, res) => {
  try {
    const client = await pool.connect();
    const result = await client.query('SELECT * FROM productos ORDER BY id DESC');
    client.release();

    res.status(200).json(result.rows);
  } catch (error) {
    console.error('Error fetching records:', error);
    res.status(500).json({ error: 'Error fetching records from the database' });
  }
});

// Endpoint to add a product
app.post('/addProduct', async (req, res) => {
  const { codigo, descripcion, unidad, adminKey } = req.body;

  if (!codigo || !descripcion) {
    return res.status(400).json({ error: 'Faltan codigo o descripcion' });
  }

  if (adminKey !== 'PASANTIAS90') {
    return res.status(403).json({ error: 'adminKey inválido' });
  }

  try {
    const client = await pool.connect();

    // Check if the product already exists
    const existing = await client.query('SELECT * FROM productos WHERE LOWER(codigo) = LOWER($1)', [codigo]);
    if (existing.rows.length > 0) {
      client.release();
      return res.status(409).json({ error: 'Código ya existe' });
    }

    // Insert the new product
    await client.query(
      'INSERT INTO productos (codigo, descripcion, unidad) VALUES ($1, $2, $3)',
      [codigo, descripcion, unidad || 'PAQ']
    );

    client.release();
    res.status(201).json({ message: 'Producto agregado exitosamente' });
  } catch (error) {
    console.error('Error adding product:', error);
    res.status(500).json({ error: 'Error al agregar el producto' });
  }
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'OK', message: 'Server is healthy' });
});

// Start Server
app.listen(port, () => {
  console.log(`Server running on http://localhost:${port}`);
});