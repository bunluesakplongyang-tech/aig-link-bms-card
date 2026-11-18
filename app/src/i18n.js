// TH / EN switch (AIG-LINK L.java)
let en = false;
try { en = localStorage.getItem("lang") === "en"; } catch { /* storage blocked */ }
document.documentElement.lang = en ? "en" : "th";
export const L = {
  get en() { return en; },
  t: (th, eng) => (en ? eng : th),
  set(v) { en = !!v; document.documentElement.lang = en ? "en" : "th"; try { localStorage.setItem("lang", en ? "en" : "th"); } catch { /* */ } },
};
