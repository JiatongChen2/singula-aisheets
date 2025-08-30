# 🚀 AI Sheets Auto-Loading Feature

## Overview

The Auto-Loading feature automatically detects and loads the most recent data file from the `public/data/` directory when AI Sheets starts up. This eliminates the need to manually upload files each time you restart the service.

## How It Works

1. **Service Startup**: When AI Sheets starts, it automatically scans the `public/data/` directory
2. **File Detection**: Finds the most recently modified supported data file
3. **Auto-Loading**: Automatically creates a dataset and loads the data
4. **Ready to Use**: The dataset is immediately available for AI-powered operations

## Supported File Formats

- **JSON** (`.json`)
- **CSV** (`.csv`)
- **TSV** (`.tsv`)
- **Excel** (`.xlsx`, `.xls`)
- **Parquet** (`.parquet`)

## Directory Structure

```
aisheets/
├── public/
│   └── data/           # Place your data files here
│       ├── candidates.json
│       ├── users.csv
│       └── sales.xlsx
```

## Usage

### Automatic Loading (Default)

1. **Place your data file** in `public/data/`
2. **Restart AI Sheets** service
3. **Data loads automatically** - no manual intervention needed

### Manual Loading via API

```bash
curl -X POST http://localhost:5173/api/load-public-file \
  -H "Content-Type: application/json" \
  -d '{
    "publicFileName": "data/candidates.json",
    "datasetName": "Candidates Dataset"
  }'
```

### Programmatic Loading

```typescript
import { importDatasetFromPublicFile } from '~/services/repository/datasets';

const dataset = await importDatasetFromPublicFile({
  name: "My Dataset",
  createdBy: "username",
  publicFileName: "data/myfile.json"
});
```

## Configuration

### Environment Variables

- **AUTO_LOAD_ENABLED**: Set to `false` to disable auto-loading (default: `true`)
- **DEFAULT_USERNAME**: Username for auto-loaded datasets (default: `system`)

### Customization

You can modify the auto-loading behavior by editing:
- `src/services/auto-loader/index.ts` - Core auto-loading logic
- `src/services/startup/auto-loader.ts` - Startup integration

## File Priority

The system automatically selects the **most recently modified** file when multiple files exist in the `public/data/` directory.

## Logging

Auto-loading operations are logged to the console with clear indicators:

- 🚀 Initialization messages
- 📁 File discovery information
- ✅ Success confirmations
- ❌ Error details
- 🔗 Direct links to loaded datasets

## Troubleshooting

### Common Issues

1. **No files found**: Ensure your data files are in `public/data/` with supported extensions
2. **Permission errors**: Check file permissions in the data directory
3. **Format errors**: Verify your data files are valid and not corrupted

### Debug Mode

Enable debug logging by setting `DEBUG=true` in your environment variables.

## Examples

### JSON Data
```json
[
  {"name": "John", "age": 30},
  {"name": "Jane", "age": 25}
]
```

### CSV Data
```csv
name,age,city
John,30,New York
Jane,25,San Francisco
```

## Benefits

- ✅ **Zero Configuration**: Just drop files and restart
- ✅ **Automatic Updates**: Always loads the latest data
- ✅ **Time Saving**: No manual upload process
- ✅ **Consistent Experience**: Same data available on every startup
- ✅ **Production Ready**: Perfect for automated deployments

## Future Enhancements

- [ ] Watch mode for real-time file changes
- [ ] Multiple file loading support
- [ ] Custom file naming patterns
- [ ] Scheduled auto-reloading
- [ ] Data validation before loading
