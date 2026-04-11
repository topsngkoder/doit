/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Server Actions + FormData: лимит по умолчанию ~1 MiB — иначе клиент получает
  // «An unexpected response was received from the server» при загрузке вложений.
  // Вложения: до 1 GiB на файл (`CARD_ATTACHMENT_UPLOAD_MAX_FILE_BYTES`), до 20 за раз.
  // POST `/api/.../attachments/upload` на Vercel и т.п. может иметь свой лимит тела запроса.
  experimental: {
    serverActions: {
      bodySizeLimit: "1100mb"
    }
  }
};

export default nextConfig;

