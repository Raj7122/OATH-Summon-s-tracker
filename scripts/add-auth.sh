#!/bin/bash
# Run this script to add authentication to your Amplify project
# This will work in an interactive terminal

echo "🔐 Adding Cognito Authentication to your Amplify project..."
echo ""
echo "When prompted, answer as follows:"
echo "  1. Default configuration"
echo "  2. Email (press DOWN arrow once, then ENTER)"
echo "  3. No, I am done."
echo ""
echo "Press any key to continue..."
read -n 1 -s

amplify add auth
