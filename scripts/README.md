# Database Migration Scripts

## Display Order Migration

### Purpose
This script populates the `displayOrder` field for existing products in the database based on their creation timestamp.

### Usage

1. **Make sure your database is running and accessible**

2. **Set your environment variables** (if not already set):
   ```bash
   export MONGODB_URI="mongodb://localhost:27017/eseek"
   # or your actual MongoDB connection string
   ```

3. **Run the migration**:
   ```bash
   npm run migrate:display-order
   ```

### What it does

1. **Connects to MongoDB** using the connection string from environment variables
2. **Processes each category** separately:
   - Finds all published products in the category (including subcategories)
   - Sorts them by creation time (oldest first)
   - Assigns displayOrder: 1, 2, 3, etc. based on creation order
3. **Handles orphan products** (products without valid categories)
4. **Verifies the migration** by counting products with displayOrder assigned

### Example Output

```
✅ Connected to MongoDB
🚀 Starting displayOrder migration...
📁 Found 5 categories

📂 Processing category: Electronics (64a3b2c5e8d7f01234567890)
   Found 15 products in this category
   ✅ Updated 15 products with displayOrder 1-15

📂 Processing category: Clothing (64a3b2c5e8d7f01234567891)
   Found 8 products in this category
   ✅ Updated 8 products with displayOrder 1-8

🔍 Processing products without valid category...
   Found 2 orphan products
   ✅ Updated 2 orphan products with displayOrder 1-2

🎉 Migration completed successfully!
📊 Total products updated: 25

🔍 Verification:
   Products with displayOrder: 25
   Total published products: 25
✅ All products have displayOrder assigned!
```

### Safety Features

- **Only processes published products** (skips drafts)
- **Excludes soft-deleted products** (isDeleted: true)
- **Handles missing categories gracefully**
- **Provides detailed logging** for monitoring progress
- **Verifies results** after completion

### Rollback

If you need to rollback, you can reset all displayOrder values:

```javascript
// In MongoDB shell or script
db.products.updateMany(
  { displayOrder: { $exists: true } },
  { $unset: { displayOrder: "" } }
)
```

### Notes

- The script is **idempotent** - you can run it multiple times safely
- Products are sorted by `createdAt` timestamp within each category
- Display order starts from 1 for each category
- The script automatically closes the database connection when done
