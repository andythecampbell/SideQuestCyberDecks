# SideQuest Decks

An open-source configurator for modular cyberdecks. Pick an enclosure and components, lay them out in 3D, check that they fit, and generate the printable parts that hold them together.

Early work in progress. The first build is my own deck: a Raspberry Pi 5, a 7" touchscreen, a chiclet keyboard, and a USB-C power bank.

## Layout

```
catalog/      Component and enclosure definitions (JSON, validated by the app's tests)
app/          Browser configurator (Vite, React, TypeScript, React Three Fiber)
docs/         Vision, configurator direction, plans, conventions
```

## Running it

Requires Node 22+.

```bash
npm install
npm run dev     # http://localhost:5173
npm test        # validates the catalog and domain model
```

## Contributing a component

Add a JSON file under `catalog/components/`. Follow [docs/CONVENTIONS.md](docs/CONVENTIONS.md) for units, axes, and origin, and mark every value with how you got it: `datasheet`, `measured`, or `estimate`. Run `npm test` to validate.

## License

Application code: MIT (see [LICENSE](LICENSE)). The license for catalog data and generated hardware files is still undecided.
