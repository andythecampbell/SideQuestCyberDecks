# SideQuest Decks: Product Vision

> Status: Living document  
> Started: September 29, 2026  
> Purpose: Capture the direction of the project without prematurely turning early ideas into fixed requirements.

## The idea

SideQuest Decks will make it practical for an interested person to own and use a configurable, repairable cyberdeck without first becoming an expert in component compatibility, enclosure design, electronics packaging, or fabrication.

The initial product will be a survival- and field-oriented cyberdeck assembled from qualified, replaceable modules. Customers will choose from a deliberately constrained set of cases and internal components. The configurator will validate those choices, generate any required custom mounting parts, produce a complete bill of materials, and coordinate fulfillment.

The longer-term configurator will be developed as an open-source application that can serve the broader cyberdeck community, including people who do not purchase a complete SideQuest product. Users should eventually be able to select or contribute components, bring their own enclosure, arrange a build, inspect it in three dimensions, and generate printable custom parts. SideQuest will host this application and connect qualified configurations to its store, fabrication, component sourcing, kits, assembly, and support services.

The experience should feel like buying one coherent product, even when the physical result is a kit composed largely of parts the customer could have sourced individually.

## Why this project should exist

Cyberdecks are compelling, but building one currently requires a buyer to cross too many disciplines at once:

- selecting compatible compute, display, input, storage, power, and communications components;
- determining whether everything physically fits;
- designing or adapting brackets and panels;
- understanding wiring, cooling, and power requirements;
- purchasing from several suppliers;
- and turning scattered community knowledge into a working system.

SideQuest Decks will absorb that complexity. It will preserve the agency and repairability of a DIY build while removing avoidable research and integration work.

## The larger thesis

The cyberdeck is the first product. The deeper project is a mass-customization system for physical products.

The durable value should come from:

- a structured catalog of components and their interfaces;
- compatibility and safety rules;
- supplier availability and purchasing integrations;
- parametric CAD for brackets, trays, faceplates, and port panels;
- versioned manufacturing recipes;
- configuration-specific instructions;
- and a feedback loop that turns manual fulfillment decisions into reusable automation.

Success does not require a frozen bill of materials. It requires a controlled and observable process for supporting a changing bill of materials.

The platform should also allow community knowledge to accumulate in a reusable form. Community contributions may expand the supported universe of enclosures, components, mounting patterns, and generated parts. The commercially valuable layer is not exclusivity over those contributions, but the ability to qualify them, combine them into dependable configurations, manufacture them well, and make the resulting product easy to purchase and support.

## Product principles

### One coherent buying experience

Customers should not be handed a shopping list and sent to multiple stores. The default experience should provide one configuration, one checkout, one set of instructions, and one accountable seller.

When a regulated or operationally difficult component is better supplied directly by an authorized partner, such as a lithium battery or power product, that handoff should still feel integrated into the SideQuest experience. Drop shipping is preferable to making the customer independently reconstruct the configuration.

### Constrained freedom

The product should offer meaningful customization without allowing arbitrary combinations. Every visible option should either be known to work or clearly identified as experimental and subject to review.

The configurator is not merely a visual sales tool. It is the first layer of the engineering and fulfillment system.

### Repairable and replaceable

Major components should be replaceable without discarding the full deck. Standard parts and interfaces are preferred where practical. Custom parts should primarily adapt and organize components rather than make the system unnecessarily proprietary.

### Honest preparedness

The product may be useful during power, connectivity, or infrastructure disruptions, but it should not rely on fear-based claims or imply that it guarantees safety. Its value should remain clear for field work, camping, communications, offline computing, experimentation, and ordinary use.

### Learn through real builds

The project should reach real users quickly. Early orders will have conservative lead times and will receive manual engineering review, trial fitting, and validation before shipment.

Manual work during the first builds is intentional. Each intervention should expose a rule, missing datum, supplier issue, or manufacturing step that can later be captured by the platform.

### Open participation with visible trust

The configurator should be open source. People should be able to inspect it, run it, improve it, and contribute useful component and enclosure definitions.

Openness must not obscure uncertainty. Models, rules, and configurations should carry clear provenance and validation status. A community upload that appears to fit in a three-dimensional preview is not equivalent to a configuration that has been printed, assembled, electrically reviewed, thermally tested, and qualified by SideQuest.

The interface should make these distinctions understandable without preventing experimentation. Likely trust states include unverified, community-tested, and SideQuest-qualified, with the evidence and applicable revision recorded alongside each status.

## Initial customer and offering

The initial customer is technically inclined and attracted to building or owning a cyberdeck, but does not want to solve every integration problem alone.

The initial offering is expected to include:

- a small number of supported enclosure choices;
- curated compute, display, input, storage, connectivity, and accessory options;
- custom 3D-printed mounting hardware and panels;
- all required ordinary hardware and cabling;
- configuration-specific assembly instructions;
- an optional paid assembly service;
- and a manual technical review before early configurations are fulfilled.

The first launch will be domestic only. Parts will generally be purchased for each order rather than held in inventory.

## Communications

Meshtastic is an important candidate for Deck 001 and future configurations. The initial direction is to treat communications as a qualified, modular subsystem.

A complete commercially produced Meshtastic device could remain intact and retain its original radio, labeling, antenna, and firmware while the deck provides mounting, power, cable management, and connectivity. A detachable node may also be more useful in the field than a permanently integrated radio.

Arbitrary radio modules, antennas, amplifiers, and unsupported combinations should not be exposed as early configurator options. Radio choices will need regional and configuration-specific rules.

## Power

Power is both a central product feature and a meaningful fulfillment constraint.

The preferred early direction is to use reputable, unmodified power products rather than build custom battery packs. An authorized supplier may be able to ship a selected power supply or battery directly to the customer while the SideQuest ordering experience coordinates the purchase.

The product experience should avoid forcing the customer to visit unrelated storefronts or determine compatibility independently. The exact commercial, shipping, warranty, and user-experience model for supplier-direct power fulfillment remains an open design problem.

## Configuration and fulfillment model

Each order should produce a versioned configuration record containing at least:

- selected component SKUs and suppliers;
- component and supplier revisions where known;
- mechanical interface definitions;
- voltage, connector, current, and power requirements;
- cooling and clearance constraints;
- communications constraints;
- generated part revisions and print parameters;
- assembly instructions;
- validation requirements;
- price and expected lead time;
- substitutions and customer approvals;
- and the ruleset version used to approve the configuration.

An early order is expected to move through this process:

1. The customer creates a configuration that passes initial automated checks.
2. The order is accepted subject to technical and availability review.
3. Component availability, compatibility, cost, and lead time are confirmed manually.
4. Any substitutions are presented to the customer for approval.
5. Components are ordered from their suppliers.
6. Custom parts are generated and printed.
7. The physical configuration is trial-fitted and validated.
8. The configuration record and instructions are updated with what was learned.
9. The kit or assembled deck is tested, packed, and shipped.

Over time, repeated manual decisions should become data, rules, integrations, and automation.

## Configurator direction

The configurator should grow from a constrained product configurator into a general design environment for modular cyberdecks. Its long-term capabilities may include:

- selecting components from a shared catalog or uploading new component definitions;
- selecting a known enclosure or uploading a model of an unusual case or container;
- orienting and arranging components within the enclosure;
- defining mounting surfaces, reference points, openings, and keep-out regions when they cannot be inferred reliably;
- viewing the proposed assembly in three dimensions;
- detecting known physical, electrical, thermal, access, and manufacturing conflicts;
- generating parametric trays, brackets, standoffs, faceplates, and port panels;
- exporting printable files, a bill of materials, and configuration-specific instructions;
- and transferring a frozen, versioned configuration into the SideQuest buying experience.

This is a staged direction, not a requirement for the first release. Arbitrary enclosure uploads and automatic generation of production-ready parts are difficult CAD and engineering problems. The early system should work with a small set of known enclosures, qualified components, explicit mounting information, and limited families of generated parts. It should ask the user to identify important geometry rather than pretending to infer features that cannot be recognized reliably.

### Geometry and uploaded models

The platform should not assume that a three-dimensional model is a complete component definition. A usable definition may also require dimensions, mounting holes, connector locations, cable clearances, ventilation areas, service access, tolerances, mass, power information, and provenance.

STL will be important because printable and community-created models are commonly distributed in that format. It is suitable for visualization and fabrication, but its triangle mesh does not preserve the engineering features or design intent of a parametric model. STEP or another solid CAD format should be supported where available because it is better suited to accurate measurement, feature recognition, modification, and generation of mating parts. The system should accept useful mesh-only contributions while allowing richer source geometry and metadata to improve automation and confidence.

Existing models from community repositories may provide a valuable starting point, subject to their licenses, accuracy, revision, and suitability for reuse. Uploaded and imported geometry must be treated as untrusted content, and every shared model should retain source, author, license, and revision information.

### Relationship to the store

The open-source configurator and the SideQuest storefront should have distinct responsibilities. The configurator is the source of truth for design intent, compatibility results, generated artifacts, and configuration revisions. The store should receive a frozen configuration identifier, a priced bill of materials, fulfillment choices, and the qualification status needed to complete a purchase.

Users may download generated parts and source or fabricate a build independently. SideQuest can earn revenue by offering convenience and confidence: verified printed parts, complete component bundles, qualified configurations, assembly and testing, support, warranty, and coordinated fulfillment. Community use outside the store can still improve the catalog and generators and bring more proven designs into the commercial ecosystem.

### Staged configurator development

A likely progression is:

1. Model Deck 001 and a small curated catalog while recording the decisions currently made by hand.
2. Generate a limited family of parts for known enclosures and components.
3. Allow community component and enclosure definitions with provenance and visible validation states.
4. Add guided enclosure authoring in which users identify mounting surfaces, openings, reference geometry, and clearances.
5. Expand layout validation and automatic generation as real builds reveal which rules and abstractions are dependable.

Work on the data model, component editor, three-dimensional viewer, and parametric experiments can begin before every Deck 001 component arrives. Physical builds remain necessary to validate the assumptions encoded by that work.

## Compliance and safety posture

Compliance should be designed into the configuration rules and fulfillment records rather than treated as a final checklist.

Likely early boundaries include:

- commercially produced and appropriately qualified electrical components;
- external low-voltage power rather than AC mains inside the enclosure;
- no custom battery packs;
- documented power budgets, connector compatibility, cable routing, and thermal clearances;
- supported radio devices used within their approved integration conditions;
- traceable component and configuration records;
- clear assembly, operating, and warranty documentation;
- and a defined response process for defects and safety reports.

The precise regulatory, carrier, insurance, tax, warranty, and product-liability requirements will be researched before unrestricted public sales.

## Go-to-market approach

The priority is to get a real, usable site online quickly rather than perfect the entire operational system in advance.

The first four or five builds can come through friends, associates, and word of mouth. They should be treated as genuine customer builds with conservative lead-time promises, documented review, and deliberate follow-up.

The initial site should prove that a customer can:

- understand the product;
- construct a valid configuration;
- see what each choice changes;
- receive a credible price and lead time;
- place an order or reserve a build;
- and follow the order through a transparent built-to-order process.

The site does not need complete supplier automation or fully generalized CAD before launch. It should, however, preserve configuration data in a form that can support those capabilities later.

## Deck 001

Deck 001 will be the first complete reference configuration, the founder's personal deck, and the basis for the first customer options.

It should simultaneously answer three questions:

1. Is this a cyberdeck worth owning and using?
2. Can its meaningful variations be represented by a configurator?
3. Can SideQuest fulfill those variations reliably enough to sell them?

Deck 001 has not yet been specified. The next design session should define:

- its primary jobs and expected environments;
- enclosure and approximate size;
- compute platform;
- display and input approach;
- storage and offline capabilities;
- power architecture and runtime target;
- Meshtastic or other communications integration;
- external ports and expansion strategy;
- field repair and upgrade expectations;
- kit versus assembled scope;
- and the initial customer-visible option boundaries.

## Early measures of success

For the first several builds, learning matters more than volume. Useful measures include:

- customers can complete the configurator without substantial explanation;
- invalid combinations are prevented or caught during review;
- the quoted price and lead time survive supplier reality;
- generated and printed parts fit with minimal rework;
- instructions are sufficient for a kit customer to succeed;
- assembled configurations pass a repeatable validation process;
- each manual intervention produces a reusable improvement;
- and the true margin remains acceptable after labor, failures, support, and shipping.

## Open questions

- What is the single clearest job Deck 001 should perform?
- Is the primary offer a kit, an assembled product, or both from launch?
- How should payment work while orders still require manual technical review?
- Can supplier-direct battery fulfillment remain a unified checkout experience?
- Which Meshtastic device and integration pattern should be qualified first?
- Which parts are meaningfully configurable versus merely selectable?
- What is the smallest useful parametric CAD problem to solve first with Zoo?
- Which CAD kernel, geometry representation, and parametric system best support an open-source application?
- Which parts of the configurator must run in the browser, and which generation or validation work belongs on a server or local worker?
- What information must accompany a component or enclosure model before it can participate in automated checks?
- Which import and export formats should be supported first, including STL, 3MF, and STEP?
- What licenses should apply to the application, shared definitions, generated designs, and contributed hardware models?
- How will externally sourced models retain attribution and license restrictions without being mistaken for original SideQuest assets?
- What evidence is required for community-tested and SideQuest-qualified status?
- What configuration data model will survive changes in suppliers and part revisions?
- What must be tested on every individual build, and what can be qualified once per configuration?
- What customer support boundary makes the product sustainable?
- What should the brand promise beyond preparedness and survival scenarios?

## Decisions and changes

Material decisions should be recorded here as the vision evolves. Rejected ideas are worth preserving when the reasoning could prevent the same question from being reopened without new information.

- The configurator is intended to be an open-source application serving both SideQuest customers and the broader cyberdeck community.
- The long-term direction includes user-contributed components and enclosures, interactive layout, three-dimensional inspection, and generation of custom printable parts.
- The first release will remain deliberately constrained; support for arbitrary uploads and automated production-ready output will be added progressively and will not be implied merely by accepting a model.
- Community participation and independent file downloads are compatible with the business model. SideQuest will compete on qualification, fabrication, sourcing, fulfillment, assembly, support, and trust.
- 2026-10-07: The business is a primary goal. Grow revenue in steps, each lower-risk than the next: (1) free open-source generator and catalog, (2) printed mounting kits for known component sets, with no batteries or electronics, (3) component bundles, (4) assembled and qualified decks.
- 2026-10-07: Deck 001 is an ongoing personal build, not a milestone to finish before configurator work. Its real parts are the first catalog entries.
- 2026-10-07: The catalog lives in git as JSON files validated by the app's tests. Contributions are pull requests. A database comes later, if ever, for orders and configurations rather than the catalog.
- 2026-10-07: The Shopify store stays a landing page and email list until there's a printed kit to sell. Don't resell components.
- 2026-10-07: Z-up, millimeters. See [Conventions](./CONVENTIONS.md).
- 2026-11-06: The first product milestone is **Deck 001 alpha**: a physical Deck 001, represented by a versioned configuration, with at least one installed part that was generated reproducibly. A working deck built only from hand-drawn parts doesn't meet it. The [Deck 001 alpha roadmap](./DECK_001_ALPHA_ROADMAP.md) is the current plan. [Initial configurator plan](./INITIAL_CONFIGURATOR_PLAN.md) is historical. This narrows the 2026-10-07 entry: the deck is still a personal build, but this milestone now sets the order of configurator work.
- 2026-11-06: Automated interference, bounds and keep-out detection is deferred until physical build results show which checks can be trusted. Until then, the configurator shows a persistent warning that fit is unvalidated and makes no fit claims. If a check is added later, it is labelled a preliminary layout check, not a fit claim.
