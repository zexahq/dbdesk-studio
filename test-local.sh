#!/bin/bash

# Quick local testing script for dbdesk-studio NPM package

set -e

echo "╔════════════════════════════════════════════════════════════╗"
echo "║    dbdesk-studio: Local Testing Script                    ║"
echo "╚════════════════════════════════════════════════════════════╝"
echo ""

# Step 1: Build
echo "📦 Step 1: Building project..."
pnpm build > /dev/null 2>&1
echo "✓ Build complete"
echo ""

# Step 2: Link
echo "🔗 Step 2: Linking package locally..."
npm link > /dev/null 2>&1
echo "✓ Package linked to /usr/local/bin/dbdesk-studio"
echo ""

# Step 3: Verify
echo "✅ Step 3: Verifying installation..."
if command -v dbdesk-studio &> /dev/null; then
    echo "✓ dbdesk-studio command found"
else
    echo "✗ dbdesk-studio command not found (may need sudo)"
    exit 1
fi
echo ""

# Step 4: Test help
echo "📖 Step 4: Testing help command..."
dbdesk-studio --help > /dev/null 2>&1
echo "✓ Help command works"
echo ""

# Step 5: Show next steps
echo "════════════════════════════════════════════════════════════"
echo ""
echo "✅ Local testing setup complete!"
echo ""
echo "Next steps:"
echo ""
echo "  1. Run the application:"
echo "     $ dbdesk-studio"
echo ""
echo "  2. Open in browser:"
echo "     http://localhost:9876"
echo ""
echo "  3. Test with custom ports:"
echo "     $ dbdesk-studio --backend-port 4000 --frontend-port 8080"
echo ""
echo "  4. When done, unlink:"
echo "     $ npm unlink"
echo ""
echo "════════════════════════════════════════════════════════════"
