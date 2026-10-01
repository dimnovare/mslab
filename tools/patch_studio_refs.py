# One-off patch: align Studio with Maria's reference images (photo_4 practice, photo_5 blog, HOFIN).
import io, os
p = os.path.join(os.path.dirname(__file__), "..", "site", "p", "studio", "app.js")
s = io.open(p, encoding="utf-8").read()

def rep(a, b):
    global s
    assert s.count(a) == 1, a[:70]
    s = s.replace(a, b)

rep("""  const newsCard = (a) =>""", """  const newsDark = (a) => `<a class="news dk" href="#/uudis/${a.id}"><div class="ph"><img src="${a.img}" alt="" loading="lazy"></div><div class="bd"><span class="dt">${a.d} · ${a.k}</span><h3>${esc(a.t)}</h3><span class="ex">${esc(a.ex)}</span></div></a>`;
  const FAQ = [
    ["Kas vajan eelnevaid kogemusi?", "Ei. Baaskoolitused on mõeldud alustajatele ja on mahukamad. Täiendkoolitused sobivad neile, kes juba töötavad ja soovivad õppida konkreetset tehnikat."],
    ["Mis juhtub pärast e-koolituse ostu?", "Sulle luuakse automaatselt õpilase konto ja saad kinnituse e-postiga. Logi sisse ja alusta kohe — videod ja materjalid on avatud kogu ligipääsu aja."],
    ["Mis vahe on kontakt- ja hübriidõppel?", "Kontaktõpe toimub täielikult kohapeal. Hübriidõppe puhul õpid teooria veebis omas tempos ja kohapeal toimub ainult praktiline osa."],
    ["Kas modellid tuleb ise leida?", "Ei. Praktikaks leiab modellid koolituskeskus ning kõik töövahendid on kohapeal olemas."],
    ["Kas saan maksta osade kaupa?", "Kontakt- ja hübriidkoolitusi saab tasuda ka 50% ettemaksuga. E-õppe moodulid avanevad kohe pärast ettemaksu."],
    ["Millal saan tunnistuse?", "Pärast koolituse lõpetamist: e-õppes pärast testi, kontakt- ja hübriidõppes pärast praktilise töö hindamist."],
  ];
  const newsCard = (a) =>""")

rep("""    <section class="sec"><div class="wrap">
      <div class="row-head"><div><p class="eyebrow">Koolitused</p><h2 class="h2">Vali oma koolitus.</h2>""", """    <section class="sec stmt"><div class="wrap"><p class="eyebrow center">MS LAB Koolituskeskus</p>
      <p class="statement">Õpetame kulmu- ja ripsmetehnikaid nii, <span>nagu oleksime ise tahtnud õppida — väikestes gruppides, päris modellidel ja toega ka pärast koolitust.</span></p></div></section>

    <section class="sec" style="padding-top:0"><div class="wrap">
      <div class="row-head"><div><p class="eyebrow">Koolitused</p><h2 class="h2">Vali oma koolitus.</h2>""")

rep("""<div class="tile dark"><div class="prac-teaser">""", """<div class="tile orchid"><div class="prac-teaser">""")
rep("""<p class="lead" style="color:#D5D0D3">Modellid""", """<p class="lead">Modellid""")
rep("""<a class="btn light" href="#/praktika">Vaata pakette</a>""", """<a class="btn" href="#/praktika">Vaata pakette</a>""")

rep("""    <section class="sec"><div class="wrap">
      <div class="row-head"><div><p class="eyebrow">Uudised ja nõuanded</p><h2 class="h2">Loe blogist.</h2></div><div style="display:flex;gap:16px;align-items:center"><a class="more" href="#/uudised">Kõik postitused</a>${carCtl("newsCar")}</div></div>
    </div>${carousel("newsCar", NEWS.map(newsCard).join(""))}</section>""", """    <section class="sec"><div class="wrap"><div class="blogp">
      <div class="bh"><div><p class="eyebrow">Blogi</p><h2 class="h2">Uudised ja nõuanded</h2></div><p>Nõuanded, uued koolitused ja õpilaste lood. Iga kaart viib täismahus postitusele.</p></div>
      <div class="bl"></div>
      ${carousel("newsCar", NEWS.map(newsDark).join(""))}
      <div class="bf"><a class="more" href="#/uudised">Kõik postitused</a>${carCtl("newsCar")}</div>
    </div></div></section>""")

rep("""    <section class="sec"><div class="wrap"><div class="nl">""", """    <section class="sec"><div class="wrap faq">
      <div><p class="eyebrow">KKK</p><h2 class="h2">Korduma kippuvad küsimused</h2></div>
      <div class="qs">${FAQ.map((q, i) => `<details${i === 0 ? " open" : ""}><summary>${q[0]}</summary><p>${q[1]}</p></details>`).join("")}</div>
    </div></section>

    <section class="sec tight" style="padding-top:0"><div class="wrap"><div class="contact">
      <div><p class="eyebrow">Kontakt</p><h2 class="h2">Ei tea, milline koolitus sobib?</h2><p class="lead">Kirjuta Mariale — soovitan sulle sobiva koolituse ja õppevormi.</p>
        <div class="who"><img src="assets/maria-seated.jpg" alt=""><span><b>Maria Sosnina</b><br>vastab tavaliselt ühe tööpäeva jooksul</span></div></div>
      <form id="cForm" class="cf"><label>Nimi<input required autocomplete="name"></label><label>E-post<input type="email" required autocomplete="email"></label><label>Sõnum<textarea required placeholder="Nt. olen algaja ja huvitun kulmudest…"></textarea></label><button class="btn">Saada</button></form>
    </div></div></section>

    <section class="sec" style="padding-top:0"><div class="wrap"><div class="nl">""")

rep("""    // newsletter
    $("#nlForm").onsubmit""", """    $("#cForm").onsubmit = (e) => { e.preventDefault(); e.target.outerHTML = `<div class="ok-box" style="background:#fff;color:#222"><i>✓</i><div><b>Sõnum on saadetud.</b><br><span class="muted">Maria vastab peagi (näidis).</span></div></div>`; };
    // newsletter
    $("#nlForm").onsubmit""")

rep("""<a class="btn" href="#pk">Vali pakett</a><a class="btn ghost" href="#proto">Praktikaprotokoll</a>""", """<a class="btn" href="#pk">Vali pakett</a><a class="btn ghost" href="#pk">Praktikaprotokoll</a>""")
rep("""    <section class="sec tight" id="proto"><div class="wrap"><div class="darkp">
      <div><p class="eyebrow">Kuidas praktika käib</p><h2 class="h2">Koolitaja on kogu aeg sinu kõrval.</h2>""", """    <section class="sec tight" id="pk"><div class="wrap"><div class="darkp">
      <div><p class="eyebrow">Praktikapaketid</p><h2 class="h2">Vali praktikapakett.</h2>""")
rep("""      </div></div></div></section>
    <section class="sec tight" id="pk"><div class="wrap">
      <div class="row-head"><div><p class="eyebrow">Praktikapaketid</p><h2 class="h2">Vali endale sobiv.</h2></div></div>
      <div class="pkgs">""", """      </div>
      <div class="pkgs">""")
rep("""Registreeru</button></article>`).join("")}</div>
      <div id="regForm"></div>""", """Registreeru</button></article>`).join("")}</div></div>
      <div id="regForm"></div>""")

io.open(p, "w", encoding="utf-8").write(s)
print("patched")
