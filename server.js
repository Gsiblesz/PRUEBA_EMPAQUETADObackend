const express = require('express');
const cors = require('cors');
const { Pool } = require('pg');
const app = express();

app.use(cors());
app.use(express.json());

// Configuración de base de datos
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

// --- RUTA DE SALUD (Para verificar en navegador) ---
app.get('/health', (req, res) => { res.send('OK'); });

// --- RUTAS DE CATALOGOS (NECESARIAS PARA LAS LISTAS) ---

app.get('/responsables', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM responsables ORDER BY nombre_completo');
    res.json(result.rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/sedes', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM sedes ORDER BY nombre');
    res.json(result.rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/destinos', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM destinos ORDER BY nombre');
    res.json(result.rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/productos', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM productos ORDER BY descripcion');
    res.json(result.rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// --- RUTA DE ENVIO DE FORMULARIO ---
app.post('/empaquetados', async (req, res) => {
    // ... tu lógica actual de inserción ...
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Servidor corriendo en puerto ${PORT}`));
