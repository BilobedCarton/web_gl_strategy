# Game Design Spec

## Elevator Pitch

A fantasy city-state trading strategy game where 3-5 rival cities compete for economic dominance through trade networks, production chains, and cold war diplomacy — all driven by procedurally generated terrain.

---

## Setting & Tone

- **Era:** Medium fantasy — a grounded world where magic is an industry, not a superpower
- **Magic as resource:** Mana crystals, enchanting workshops, magical creatures as trade goods. Magic integrates into production chains alongside mundane resources
- **Magic access:** Discovery-based — magical resource deposits are hidden and must be found through exploration or events. Adds unpredictability and scouting value
- **Aesthetic:** Fantasy city-states with distinct identities shaped by their geography — a mountain hold smelting enchanted ore, a coastal city trading in sea-silk and arcane coral

---

## Map & Territory

- **Grid size:** 75x75 tiles (up from current 50x50)
- **City count:** 3-5 city-states per game
- **Neutral territory:** ~40-50% of the map is unclaimed wilderness between cities
- **Neutral resources:** Rare deposits (especially magical) located in contested neutral zones
- **Outpost system:** Cities build outposts on neutral tiles to claim resources. Outposts cost workers + materials and require supply lines back to the city

---

## Core Pillars

### 1. Trade & Production (Primary System)

**Resource catalog (8-12 raw resources) mapped to terrain:**

| Terrain   | Primary Resources   | Notes                                           |
| --------- | ------------------- | ----------------------------------------------- |
| Plains    | Grain, Livestock    | Breadbasket — feeds population growth           |
| Mountains | Iron Ore, Stone     | Rich in building/crafting materials, defensible |
| Coast     | Fish, Sea-silk      | Access to sea trade routes                      |
| Wetlands  | Herbs, Peat         | Unique reagents for alchemy/enchanting          |
| Forest    | Timber, Wild Game   | Construction and food                           |
| Tundra    | Furs, Frost Crystal | Rare cold-weather luxury goods                  |
| Desert    | Glass Sand, Spices  | Trade luxuries, glasswork                       |
| River     | Fresh Water         | Boosts adjacent production, cheap transport     |

**Magical resources (discovery-based):**

- Mana Crystals — power source for enchanting chains
- Arcane Reagents — combine with mundane goods for magical products
- Leyline Nodes — boost production in surrounding tiles

**Production chains are 2-3 steps deep with hybrid specialization:**

- Terrain determines which 2-3 raw resources a city has strong access to
- Players choose which chains to invest in and develop — you can't pursue everything
- Byproducts from one chain can feed into another, creating interdependencies between cities

**Example chains:**

- Iron Ore + Timber -> Refined Iron -> Tools (boosts all production)
- Grain + Fresh Water -> Flour -> Bread (feeds population growth)
- Herbs + Mana Crystals -> Potions (high trade value, military use)
- Iron Ore + Mana Crystals -> Enchanted Weapons (military + prestige)
- Sea-silk + Spices -> Luxury Goods (prestige + trade value)
- Timber + Stone -> Construction Materials -> Outposts / Upgrades

**Network/node-based logistics:**

- Cities connect via trade links with capacity limits
- Players allocate goods across the network — which cities get what, and how much
- Trade link capacity can be upgraded through investment
- Terrain affects link costs: mountains are expensive, rivers are cheap, coast enables sea routes
- Chokepoints and bottlenecks create natural points of strategic tension

### 2. City Management: Worker Assignment

Population provides workers you assign to production chains, military, intelligence, and outpost construction. Choosing where to allocate labor is the core city management decision.

- **Population growth:** Driven by food supply (Bread, Fish, Wild Game). More food = faster growth
- **Worker categories:** Production, Trade, Military, Intelligence, Exploration
- **Opportunity cost:** Every worker assigned to military is one not producing trade goods
- **Seasonal labor:** Some assignments are seasonal (farming workers idle in winter, can be reassigned)

### 3. Diplomacy & Tension

Three interlocking systems create tension without open warfare:

**Economic leverage:**

- Trade embargoes, price manipulation, exclusive supply deals
- Becoming sole supplier of a critical good gives power over dependent cities
- Breaking trade agreements is possible but damages reputation

**Reputation & influence:**

- Prestige/influence score tracks cultural and diplomatic standing
- Cities compete for alliance leadership and neutral trade hub control
- Reputation affects AI willingness to deal and the terms they offer

**Scarcity & competition:**

- Limited rare resources (fantasy materials) on neutral territory
- Cities compete to claim or control them via outposts
- Trade route capacity is finite — competing for the same links

**Deal system:** Honor-based — agreements are handshake deals enforced by reputation. Players can break them, but suffer influence penalties and AI trust decay.

### 4. Cold War Military

- Cities maintain armies as diplomatic tools — military strength affects negotiation leverage
- Arms races: investing military workers diverts from production/trade
- Proxy conflicts: support bandit factions or monster incursions near rivals (plausible deniability)
- Direct war is possible but catastrophically expensive for both sides — true last resort
- Military posturing: moving troops near borders as a diplomatic signal

### 5. Espionage (Two-Layer System)

**Layer 1 — Passive intel from trade:**

- Trading with a city naturally reveals information about it
- More trade volume = more visibility into their economy
- You learn what they're producing, what they need, rough stockpile levels
- Cutting trade with a rival blinds you to their activities

**Layer 2 — Active intelligence (worker assignment):**

- Assign workers to intelligence operations targeting a specific rival
- Intelligence workers can perform missions:
  - **Reconnaissance:** Reveal hidden stockpiles, military composition, production capacity
  - **Sabotage:** Disrupt a production chain for a season, damage an outpost
  - **Disrupt relationships:** Sow distrust between two rival cities, weaken their trade deals
  - **Raid caravans:** Intercept goods on a trade link (risk of being caught, major reputation hit)
- Missions take time (1-2 seasons) and have a chance of failure/exposure
- Getting caught triggers diplomatic consequences proportional to the action

### 6. Terrain as Full Simulation

The procedural terrain system drives gameplay deeply:

- **Climate affects yields:** Crop production varies by temperature/moisture. Tundra cities can't farm, desert cities need water trade
- **Rivers as highways:** River connections between cities are cheap, high-capacity trade links
- **Coastal advantage:** Sea trade, fishing industry, naval power projection
- **Mountains as barriers:** Expensive links but rich in ore and defensible
- **Wetlands:** Unique resources (herbs, reagents) but slow movement
- **Seasonal effects (terrain-scaled):** Effects scale with existing terrain temperature/moisture data. Cold tiles get harsher winters, wet tiles get monsoon boosts. The simulation layer already in place drives seasonal gameplay directly

---

## Game Structure

### Turn Structure: Seasons/Phases

Each turn represents a season. A full year = 4 turns (Spring, Summer, Autumn, Winter). Each turn has ordered phases:

1. **Production phase** — Cities produce goods from their chains. Seasonal/terrain modifiers apply
2. **Trade phase** — Players set trade offers, allocate goods across their network
3. **Diplomacy phase** — Propose/accept/break deals. Military posturing. Espionage results revealed
4. **Events phase** — Minor random events resolve (good harvest, caravan ambush, magical discovery)

**Seasonal modifiers (terrain-scaled):**

| Season | Effect                             | Terrain Interaction                                                                     |
| ------ | ---------------------------------- | --------------------------------------------------------------------------------------- |
| Spring | Growth boost, routes reopen        | Wet tiles get flooding risk, cold tiles thaw late                                       |
| Summer | Peak production                    | Hot/dry tiles risk drought, coastal tiles peak fishing                                  |
| Autumn | Harvest, stockpile phase           | Moderate yields, best time to prepare for winter                                        |
| Winter | Reduced production, route closures | Cold tiles severely impacted, mountain passes close. Warm coastal tiles barely affected |

### Victory Condition: Economic Influence

**Composite score** combining three factors — fully visible to all players:

1. **Trade dependency:** How many cities rely on your exports for critical goods
2. **Monopoly control:** Resources or finished goods you are the sole/primary supplier of
3. **Accumulated wealth:** Total treasury value

First city-state to cross the economic influence threshold wins. Visible scores create tension: as one city approaches victory, others can coordinate counter-play (embargoes, rival alliances, espionage).

### Session Length: 45-90 minutes

- Target ~20-30 game-years (80-120 turns/seasons)
- Early game: establish production, scout terrain, initial trade deals, discover magic deposits
- Mid game: specialization locks in, alliances form, cold war tensions build, outpost competition
- Late game: race to economic threshold, deal-breaking, desperate diplomacy

---

## Information & Fog

**Partial fog of war:**

- Full visibility of your own city: production, stockpiles, military, workers
- Other cities: you see their trade offers, public actions, and general reputation
- Hidden from you: rival stockpiles, production capacity, military composition, espionage operations
- **Trade reveals info passively** — more commerce with a city = more you learn about them
- **Intelligence workers** can actively uncover hidden information about specific rivals

---

## AI City-States

**Personality-driven behavior:**

- Each AI city-state has distinct traits that shape their decisions:
  - **Greedy:** Maximizes profit, drives hard bargains, hoards rare goods
  - **Isolationist:** Self-sufficient, reluctant to trade, strong military deterrent
  - **Expansionist trader:** Aggressively builds trade links, offers good deals to build dependency
  - **Diplomatic:** Seeks alliances, mediates conflicts, pursues influence victory
  - **Militarist:** Invests heavily in armies, uses intimidation, runs espionage
- Traits are visible to the player (you know who you're dealing with)
- AI responds to reputation and deal history within their personality framework

---

## Random Events (Minor)

Small events that add variety without upending strategy:

- **Good/bad harvest:** +/- production modifier for one season
- **Trade caravan ambush:** Goods lost on a route (hints at rival espionage?)
- **Magical discovery:** New mana crystal or reagent deposit found in neutral territory
- **Festival/plague:** Population boost or penalty for one city
- **Monster sighting:** NPC threat near a trade route or outpost, requires military response or rerouting
- **Leyline surge:** Temporary production boost in an area with magical resources

---

## Multiplayer Considerations (Future)

Designed single-player first, but systems are multiplayer-compatible:

- Simultaneous turn resolution works naturally with the phase structure
- Honor-based deals create meaningful social dynamics between human players
- Partial fog rewards intelligence and bluffing
- 3-5 players fits well for live sessions within the 45-90 minute target
- Async/play-by-mail is viable given the turn-based structure

---

## Open Questions

- UI design for trade network management and worker assignment
- Exact economic influence threshold and scoring weights
- Espionage mission success/failure probability curves
- Outpost construction costs and supply line mechanics
- AI decision-making architecture (behavior trees, utility AI, etc.)
- Balancing magical vs. mundane production chain value
- How military units work mechanically (if war does happen)
