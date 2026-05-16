async function test() {
  const fetch = global.fetch || require("node-fetch");
  const res = await fetch("http://localhost:3001/api/info", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ url: "https://www.youtube.com/watch?v=jNQXAC9IVRw" })
  });
  const data = await res.json();
  if (data.formats) {
    data.formats.forEach(f => console.log(f.format_id, f.ext, f.vcodec, f.acodec, f.height));
  } else {
    console.log("No formats returned.");
  }
}
test();
