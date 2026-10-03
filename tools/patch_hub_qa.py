# One-off patch: hub answers Maria's questions from the 26.09 feedback and marks direction A as the one she saw.
import io, os
p = os.path.join(os.path.dirname(__file__), "..", "app", "public", "guide", "index.html")
s = io.open(p, encoding="utf-8").read()

def rep(a, b):
    global s
    assert s.count(a) == 1, a[:70]
    s = s.replace(a, b)

rep('pts:["Täislaiuses esilehe bännerid — menüü ja logo muutuvad heledal ja tumedal pildil automaatselt","Sinu esimese tagasiside järgi täiendatud: linn kalendris, praktika selgitus, 01–06 sammud",',
    'pts:["Seda suunda nägid 25.09 piltidel — nüüd sinu tagasisidega täiendatud: linn kalendris, praktika selgitus ja protokoll, 01–06 sammud, märgised","Täislaiuses bännerid, menüü ja logo muutuvad heledal ja tumedal pildil",')
rep('pts:["Apple\'i stiilis: äärest ääreni bännerid, mis vahetuvad ise (peatatav), suurem ja loetavam kiri","Sinu värvipalett (Orchid Tint) ja sinu fotod; blogi karussell klikitavate kaartidega",',
    'pts:["Apple\'i stiilis: äärest ääreni bännerid, mis vahetuvad ise (peatatav), suurem ja loetavam kiri","Sinu saadetud näidete järgi: tume blogikarussell, MINI/MAXI tumedas kastis, KKK ja kontaktivorm; sinu värvipalett ja fotod",')

QA = [
    ("Kas menüü ja logo värv muutub vastavalt bänneri taustale?",
     "Jah. Päris lehel märgid igale bännerile töölaual „hele“ või „tume“ ning menüü, logo ja nupud muutuvad vastavalt. See on kindlam kui pildi automaatne tuvastamine. Proovi suundades A ja D."),
    ("Kas saan MINI ja MAXI paketi sisu ise muuta?",
     "Jah, oma töölaualt — punkte saab lisada, muuta ja eemaldada. Proovi: D → Admin → Praktikapaketid, või B → Admin."),
    ("Kuidas näeb õpilase vaade välja, kui tal on mitu koolitust?",
     "Kõik ostetud koolitused on ühes vaates eraldi kaartidena — igaühel oma edenemine, kontaktpäev ja järgmine samm. Vaata D, B või C → Õppija."),
    ("Kas saan koolitustele ise märgiseid lisada?",
     "Jah: vali valmis silt („Uus“, „Populaarne“, „Bestseller“ …) või kirjuta oma, vali värv ja salvesta. Arendajat pole vaja. Proovi: D → Admin."),
    ("Tunnistus",
     "Teeme tööriista, mis loob tunnistuse automaatselt: õpilase nimi sinu tunnistuse kirjas, kuupäev ja tunnistuse number. Selleks on vaja Canva linki või puhast tausta ja kirja faili."),
    ("Pisikesed kirjad bänneril olid udused",
     "D-s on bänneri kiri suurem. Lõplikus versioonis kasutame teravaid originaalpilte ja logo vektorfaili (SVG)."),
]
block = '''
<section><div class="wrap">
  <p class="eyebrow">Sinu küsimused</p>
  <h2>Vastused sinu tagasisidele</h2>
  <div class="qa">''' + "".join('<div><h3>%s</h3><p>%s</p></div>' % q for q in QA) + '''</div>
</div></section>

<section><div class="wrap">
  <p class="eyebrow">Arhiiv</p>'''
rep('''<section><div class="wrap">
  <p class="eyebrow">Arhiiv</p>''', block)
rep('.notes{margin:', '.qa{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:14px;margin-top:32px}\n.qa>div{border:1px solid var(--line);border-radius:22px;padding:24px 26px}\n.qa h3{font:500 19px/1.3 var(--disp);margin:0 0 8px}\n.qa p{margin:0;font-size:15px;color:var(--ink2)}\n@media (max-width:760px){.qa{grid-template-columns:1fr}}\n.notes{margin:')
io.open(p, "w", encoding="utf-8").write(s)
print("patched")
