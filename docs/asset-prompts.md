# Asset prompts (Meshy: image first, then image to 3D)

These are the bodies, heads, headgear, props and horse for every land unit.
The prompts follow the one that worked for the pilot body:

> low poly skyrim-style ancient Briton warrior, realistic proportions, bare head, fair hair,
> plain light grey knee-length tunic, brown trousers, leather shoes, no weapon, A-pose

## Rules for every prompt

- **Team colour key: solid magenta cloth.** The importer turns it into the owner's colour.
  - Light grey worked for the pilot, but it can't tell cloth from steel. Mail, plate and breastplates are grey too, and would turn team-coloured.
  - Nothing historical is magenta, so it is a clean key. The importer will read magenta, and the old grey key keeps working for the pilot.
- **Bodies have no head of their own that matters.**
  - Use: `short cropped hair, clean-shaven, medium skin tone, no helmet`.
  - The head is cut off at the neck and replaced by a head from the ethnicity list (H/F). Bare skin on the body (hands, bare chest, legs) is recoloured to match that head.
  - Long hair or a coif would be left behind on the shoulders, so avoid them.
- **Helmets and hats are separate props** (G list), placed on whichever head is in use.
- **Image stage:** finish with `full body, front view, plain white background, even lighting`. Make sure the feet are visible and the hands are open and empty.
- **Downloads:**
  - Bodies: **rigged (Mixamo skeleton) FBX + textured FBX + texture PNG**.
  - Everything else: textured only (FBX or GLB plus PNG).
  - Put each one in its own folder named by its id: `assets/ai/B2/`, `assets/ai/H3/`, `assets/ai/P4/`, and so on.
- **Target triangle counts:** bodies about 800, heads about 300, headgear 150–200, weapons about 150, shields about 120, horse about 1,200.

## Bodies (rigged + textured)

Every body prompt starts with
`low poly skyrim-style <subject>, realistic proportions, short cropped hair, clean-shaven, medium skin tone, no helmet,`
and ends with
`no weapon, empty open hands, A-pose, full body, front view, plain white background`.
The middle part is:

| id | used by | middle of the prompt |
|---|---|---|
| B1 | warrior, slinger | *tribal warrior:* bare chest, fur pelt over one shoulder, leather wrist wraps, knee-length loincloth and wide waist sash in solid magenta cloth, bare legs, leather foot wraps |
| B2 | spearman, archer, horseman, chariot archer | *ancient soldier:* knee-length linen tunic in solid magenta, brown leather cuirass with shoulder flaps, leather belt, bare legs, leather sandals with ankle straps |
| B3 | swordsman, composite bowman | *classical legionary:* segmented steel plate armour on chest and shoulders, short-sleeved knee-length tunic in solid magenta below the armour, leather strip skirt, bare legs, hobnailed sandals |
| B4 | man-at-arms, longswordsman, knight | *medieval knight:* long-sleeved chainmail hauberk to the knees, sleeveless belted surcoat in solid magenta to the knees, chainmail leggings, leather boots, no coif |
| B5 | pikeman, crossbowman | *medieval levy:* thick quilted padded gambeson to mid-thigh in solid magenta, leather belt, brown wool hose, leather ankle boots |
| B6 | musketman, lancer | *renaissance soldier:* puffed slashed doublet sleeves and short puffed breeches in solid magenta, steel breastplate over the chest, small white collar, dark stockings, leather shoes |
| B7 | rifleman, cavalry | *napoleonic infantryman:* short-tailed military coatee in solid magenta with white crossbelts and brass buttons, high collar, white trousers, black gaiters, black shoes |
| B8 | great war infantry, machine gun | *world war one infantryman:* long khaki wool greatcoat, solid magenta collar tabs and a wide solid magenta armband on the left upper arm, ammunition pouch belt, puttees wound on the shins, leather boots |
| B9 | infantry, marine, paratrooper, special forces | *modern soldier:* camouflage combat fatigues, tactical vest with pouches, solid magenta shoulder patches and a solid magenta armband, knee pads, combat boots |
| B10 | settler | *medieval peasant man:* belted brown wool tunic to the knees, shoulder cloak in solid magenta with the hood down, brown trousers, rope belt with a pouch, leather shoes |
| B11 | settler (women) | *medieval peasant woman* (use `hair tied in a bun` instead of short hair and clean-shaven): ankle-length dress in solid magenta, plain brown apron, undyed linen shoulder shawl, leather shoes |
| B12 | scout, explorer | *explorer:* travel cloak in solid magenta from the shoulders to the calves, leather jerkin over a linen shirt, satchel on a strap across the chest, trousers tucked into tall boots |
| B13 | commander | *noble officer:* long dark navy coat with gold trim and buttons, shoulder cape in solid magenta, white gloves, tall black riding boots |

## Heads (textured only)

Template:
`low poly skyrim-style head and neck bust of a <who>, realistic proportions, <skin>, <hair>, <facial hair>, neutral expression, looking straight ahead, neck cut at the collarbone, no shoulders, no helmet, no hat, front view, plain white background`

Hair must not reach the shoulders; tie it back or keep it short.

| id | civs | who · skin · hair · facial hair |
|---|---|---|
| H1 | English, French, Germans, Russians | northern European man · fair skin · short light brown hair · short beard |
| H2 | Vikings | Scandinavian man · very fair skin · blond hair tied back · full braided blond beard |
| H3 | Romans, Greeks, Spanish | Mediterranean man · olive skin · short dark brown curly hair · clean-shaven |
| H4 | Babylonians, Persians, Hebrews | West Asian man · light brown skin · black hair · full curled black beard |
| H5 | Egyptians | ancient Egyptian man · brown skin · short black hair · clean-shaven |
| H6 | Indians | South Asian man · brown skin · black hair · moustache |
| H7 | Ethiopians | Ethiopian man · dark brown skin · short black curly hair · short beard |
| H8 | Chinese, Japanese | East Asian man · light tan skin · black hair in a topknot · thin moustache |
| H9 | Mongols | Mongolian steppe man · weathered tan skin · black hair in braids behind the ears · thin long moustache |
| H10 | Aztecs | Mesoamerican man · copper-brown skin · straight black hair cut at the neck with a fringe · clean-shaven |
| F1–F10 | same civs as H1–H10 | the same people as women · same skin · hair tied back in a bun · no facial hair |

Hair colour and skin shade still vary a little per figure (the shader already does this), so ten heads stretch across 18 civs.

## Headgear (textured only, placed on the head)

Template:
`low poly skyrim-style <item>, single object, no head inside, front three-quarter view, plain white background`

| id | worn by | item |
|---|---|---|
| G1 | Romans, Greeks (ancient) | bronze crested helmet with cheek guards and a horsehair crest in solid magenta |
| G2 | B3 legionary | Roman imperial helmet with neck guard, cheek guards and a transverse crest in solid magenta |
| G3 | Egyptians, Hebrews, Germans | simple rounded bronze skull cap helmet |
| G4 | English, Russians, Vikings, Babylonians, Mongols | conical steel helmet with nasal guard |
| G5 | Persians, Indians | wrapped cloth turban in solid magenta |
| G6 | Chinese, Japanese | wide conical lacquered war hat with chin cord |
| G7 | Aztecs | feathered warrior headdress, feathers in solid magenta |
| G8 | French, Spanish, B5 levy | steel kettle hat with a wide brim |
| G9 | B6 | steel morion helmet with a curved brim and a comb |
| G10 | B7 | tall black shako with a brass plate and a solid magenta plume |
| G11 | B8 | world war one steel helmet with a wide brim |
| G12 | B9 | modern combat helmet with a cloth cover |
| G13 | B12 | wide-brimmed leather traveller's hat |
| G14 | B13 | black bicorne hat with a solid magenta cockade |
| G15 | B11 | simple linen headscarf tied under the chin |

## Weapons and shields (textured only, placed in the hand)

Template:
`low poly skyrim-style <item>, single object, upright, side view, plain white background, no hands`
Shields: `front view, face painted solid magenta`, with rim and boss in metal or wood.

| id | used by | item |
|---|---|---|
| P1 | warrior | wooden war club with a knotted head |
| P2 | slinger | leather sling with a stone pouch |
| P3 | spearman, horseman | wooden spear with a leaf-shaped bronze head |
| P4 | swordsman | short Roman sword (gladius) |
| P5 | longswordsman, man-at-arms | medieval longsword with a cross guard |
| P6 | pikeman | very long wooden pike with a steel head |
| P7 | knight, lancer | wooden cavalry lance with a steel tip |
| P8 | cavalry, commander | curved cavalry sabre with a hand guard |
| P9 | archer | simple wooden longbow, strung |
| P10 | composite bowman, chariot archer, horse archer | recurve composite bow, strung |
| P11 | crossbowman | medieval crossbow |
| P12 | musketman | matchlock musket |
| P13 | rifleman, great war infantry | bolt-action rifle with a bayonet |
| P14 | modern infantry | modern assault rifle |
| P15 | scout | wooden walking staff |
| P16 | archers (on the back) | leather quiver with arrows |
| S1 | round | round wooden shield with a metal boss |
| S2 | big round | large round Greek hoplite shield with a bronze rim |
| S3 | kite | Norman kite shield |
| S4 | oval | oval wooden shield |
| S5 | scutum | curved rectangular Roman scutum with a boss |
| S6 | pavise | tall rectangular pavise shield |
| S7 | small | small round buckler |

## Horse (textured; rigged only if Meshy offers a quadruped rig, otherwise I rig it)

- **M1:** `low poly skyrim-style brown riding horse, realistic proportions, simple leather saddle and bridle, saddle blanket in solid magenta, no rider, standing square, side view, plain white background`
- **M2:** the same horse with `long cloth caparison in solid magenta covering the body` (knights)

## Order

1. **Pilot:** B2 + H3 + H7 + G1 + P3 + S1. It proves the head swap, the skin recolour, the magenta key and helmets on two very different heads.
2. **Ancient and medieval:** B1, B3, B4, B5, the other male heads, G2–G8, P1–P11, S2–S7, M1, M2.
3. **Gunpowder and modern:** B6–B9, G9–G12, P12–P14.
4. **Civilians:** B10–B13, F1–F10, G13–G15, P15.

In all: 13 bodies, 20 heads, 15 headgear, 23 weapons and shields, and 2 horses (about 73 generations).
