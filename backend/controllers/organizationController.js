const { listOrganizations } = require('../services/organizationService')

async function listOrganizationsHandler(_req, res) {
  try {
    const organizations = await listOrganizations()
    return res.json({ organizations })
  } catch (error) {
    return res.status(500).json({
      error: 'Failed to load organizations',
      message: error.message,
    })
  }
}

module.exports = {
  listOrganizationsHandler,
}
