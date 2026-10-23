/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    serverActions: {
      // Cargar factura desde foto (V.74): las imágenes viajan al servidor en
      // base64. Una foto preparada pesa unos cientos de KB; el tope por defecto
      // de 1 MB alcanza para una pero no para una factura de tres fotos.
      bodySizeLimit: '8mb',
    },
  },
};

export default nextConfig;
