
async function testDownload() {

  const res = await fetch("http://localhost:3001/api/download", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ url: "https://www.youtube.com/watch?v=jNQXAC9IVRw", format: "mp4", quality: "1080p" })
  });
  const data = await res.json();
  console.log("Download response:", res.status, data);
}
testDownload();
