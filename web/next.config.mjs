/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Server Actions + FormData: лимит по умолчанию ~1 MiB — иначе клиент получает
  // «An unexpected response was received from the server» при загрузке вложений.
  // Спец.: до 50 MiB на файл, до 20 файлов за раз (`validate-card-attachment-upload-request`).
  experimental: {
    serverActions: {
      bodySizeLimit: "1100mb"
    }
  }
};

export default nextConfig;

