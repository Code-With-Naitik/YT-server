
async function test() {
  const res = await fetch("http://localhost:3001/api/info", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ url: "https://www.youtube.com/watch?v=jNQXAC9IVRw" })
  });
  const data = await res.json();
  console.log("Formats type:", Array.isArray(data.formats));
  console.log("Formats length:", data.formats ? data.formats.length : "undefined");
  if (data.formats && data.formats.length > 0) {
    console.log("First format:", data.formats[0].ext, data.formats[0].vcodec, data.formats[0].height);
  }
}
test();
