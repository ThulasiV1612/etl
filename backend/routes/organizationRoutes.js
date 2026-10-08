const express = require('express')
const { listOrganizationsHandler } = require('../controllers/organizationController')

const router = express.Router()

router.get('/', listOrganizationsHandler)

module.exports = router
