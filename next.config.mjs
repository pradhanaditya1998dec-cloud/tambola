/** @type {import('next').NextConfig} */
const nextConfig = {
  async headers() {
    return [
      {
        // Match all mp3 files in /public/audio/
        source: "/audio/:file*.mp3",
        headers: [
          { key: "Content-Type",  value: "audio/mpeg" },
          { key: "Cache-Control", value: "public, max-age=31536000, immutable" },
          { key: "Accept-Ranges", value: "bytes" },
        ],
      },
    ];
  },
};
export default nextConfig;
