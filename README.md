# ZotMeta

ZotMeta is a Zotero plugin for enriching item metadata in bulk. It updates journal articles from DOI metadata, books from ISBN metadata, and arXiv preprints from arXiv IDs. It also includes PDF identifier extraction, batch progress tracking, and a Zotero settings panel for configuration and library stats.

## Features

- Update selected journal article metadata from DOI records.
- Update selected book metadata from ISBN records.
- Update arXiv preprints from arXiv identifiers.
- Extract DOI and arXiv identifiers from Zotero's PDF full-text cache when the parent item is missing an identifier.
- Create parent items for selected PDF attachments.
- Run metadata updates in a shared batch queue with configurable concurrency.
- Show one consolidated progress panel for overlapping update batches.
- Tag failed and skipped items with `ZotMeta: Failed` and `ZotMeta: Skipped`.
- View library stats and added-item activity in the ZotMeta settings panel.

## Screenshots

Screenshots can be stored in [`docs/screenshots`](docs/screenshots).

Suggested screenshots:

- ZotMeta item context menu
- Batch metadata progress panel
- ZotMeta settings panel
- Added items activity grid

## Installation

1. Download the latest `.xpi` file from [GitHub Releases](https://github.com/RoadToDream/ZotMeta/releases).
2. In Zotero, open `Tools -> Add-ons`.
3. Click the gear icon and choose `Install Add-on From File...`.
4. Select the downloaded `.xpi` file.
5. Restart Zotero if prompted.

ZotMeta 2.0 supports Zotero 7.0 through 9.0.x.

## Usage

### Update Metadata

1. Select one or more Zotero items.
2. Right-click the selection.
3. Choose `Update Metadata`.

ZotMeta will enrich supported items:

- `journalArticle` items use DOI metadata.
- `book` items use ISBN metadata.
- arXiv-like preprints use arXiv metadata.

If an item has no DOI or arXiv ID, ZotMeta can try to discover one from the item's PDF full-text cache.

### Create Parent Item

1. Select one or more PDF attachments.
2. Right-click the selection.
3. Choose `Create Parent Item`.

ZotMeta will try to extract DOI or arXiv identifiers from the PDF full-text cache. If an identifier is found, ZotMeta creates and enriches a parent item. If no identifier is found, ZotMeta creates a basic parent item using the PDF title or filename.

### Settings Panel

Open `Tools -> ZotMeta Control Panel`.

The panel includes:

- Concurrent update thread count
- Item stats
- Item type distribution
- Added-item activity by calendar year
- Project link

## Update Status Tags

ZotMeta adds tags to make follow-up easier:

- `ZotMeta: Failed` for items where metadata retrieval or saving failed.
- `ZotMeta: Skipped` for unsupported or unchanged items.

Successful updates remove these status tags from the item.

## Development

Run tests:

```bash
make test
```

Build the XPI:

```bash
make
```

The build artifact is written to `build/zotmeta-<version>.xpi`.

## Release Flow

1. Merge code and version changes.
2. Tag the release, for example:

```bash
git tag v2.0
git push origin v2.0
```

3. GitHub Actions builds and publishes the release XPI.
4. GitHub Actions opens a follow-up PR containing the generated `updates.json`.
5. Merge the `updates.json` PR to notify existing users through Zotero's update system.

## Credits

Special thanks to [make-it-red](https://github.com/zotero/make-it-red/tree/main), which is the base of the add-on.
