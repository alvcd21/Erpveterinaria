'use strict';

const express = require('express');
const router  = express.Router();

const core           = require('./medicamentos/core');
const imagenes       = require('./medicamentos/imagenes');
const presentaciones = require('./medicamentos/presentaciones');
const lotes          = require('./medicamentos/lotes');
const alertas        = require('./medicamentos/alertas');
const catalogos      = require('./medicamentos/catalogos');

// Order matters: specific static segments (/alertas/*, /lotes/all, /imagenes/:id)
// must be registered before the generic /:id param routes.
alertas.registerRoutes(router);
catalogos.registerRoutes(router);
imagenes.registerRoutes(router);       // DELETE /medicamentos/imagenes/:id (static segment)
core.registerRoutes(router);           // GET/POST/PUT/DELETE /medicamentos and /medicamentos/:id
presentaciones.registerRoutes(router);
lotes.registerRoutes(router);

module.exports = router;
