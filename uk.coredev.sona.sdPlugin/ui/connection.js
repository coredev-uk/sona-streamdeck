// How the plugin's connection to Sona stands, in every property inspector.
const { streamDeckClient } = SDPIComponents;

streamDeckClient.sendToPropertyInspector.subscribe((ev) => {
	const p = ev.payload;
	if (p && p.event === "connection") {
		const el = document.getElementById("sona-connection");
		el.textContent = p.text;
		el.classList.toggle("sona-online", p.online === true);
	}
});

streamDeckClient.send("sendToPlugin", { event: "connection" });
