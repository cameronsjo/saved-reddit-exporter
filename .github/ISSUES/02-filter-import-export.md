# feat: import/export filter configurations as JSON

**Labels:** `enhancement`, `filtering`
**Priority:** Low

## Summary

Allow users to export filter settings as JSON files and import configurations from others.

## Use Case

- Backup filter configurations before making changes
- Share filter setups with other users
- Migrate settings between vaults/devices

## Proposed Solution

- Add "Export filters" button that downloads JSON file
- Add "Import filters" button that accepts JSON file upload
- Validate imported JSON against FilterSettings schema
- Show confirmation before overwriting current filters

## Implementation Notes

- Use Obsidian's file picker for import
- Generate timestamped filename for exports: `reddit-filters-2024-01-15.json`
- Include version field for future compatibility
