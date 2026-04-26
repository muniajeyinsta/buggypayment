/** @type {import('next').NextConfig} */
const nextConfig = {
  async rewrites() {
    return [
      // Proxy all API calls to the Fastify backend
      {
        source: '/api/health',
        destination: 'http://localhost:3001/api/health',
      },
      {
        source: '/health',
        destination: 'http://localhost:3001/health',
      },
      {
        source: '/user/:uid',
        destination: 'http://localhost:3001/user/:uid',
      },
      {
        source: '/create-order',
        destination: 'http://localhost:3001/create-order',
      },
      {
        source: '/verify-payment',
        destination: 'http://localhost:3001/verify-payment',
      },
      {
        source: '/upi-config',
        destination: 'http://localhost:3001/upi-config',
      },
      {
        source: '/upi-payment',
        destination: 'http://localhost:3001/upi-payment',
      },
      {
        source: '/debug/users',
        destination: 'http://localhost:3001/debug/users',
      },
      {
        source: '/admin/users',
        destination: 'http://localhost:3001/admin/users',
      },
      {
        source: '/admin/user/:id',
        destination: 'http://localhost:3001/admin/user/:id',
      },
      {
        source: '/admin/update-user',
        destination: 'http://localhost:3001/admin/update-user',
      },
      {
        source: '/admin/create-user',
        destination: 'http://localhost:3001/admin/create-user',
      },
      {
        source: '/uploads/:filename',
        destination: 'http://localhost:3001/uploads/:filename',
      },
    ];
  },
};

module.exports = nextConfig;
