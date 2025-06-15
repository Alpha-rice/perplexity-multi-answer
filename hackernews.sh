#!/bin/bash

# Fetch the Hacker News front page
HN_PAGE=$(curl -s https://news.ycombinator.com)

# Extract the title, link, and points of the top story
echo "DEBUG: HN_PAGE: $HN_PAGE"
TITLE_LINE=$(echo "$HN_PAGE" | grep 'class="titleline"' | head -n 1)
echo "DEBUG: TITLE_LINE: $TITLE_LINE"
TITLE=$(echo "$TITLE_LINE" | sed 's/.*titleline">//' | sed 's/<span.*//' | sed 's/<a href=[^>]*>//' | sed 's/<\/a>//' | sed 's/&amp;/\&/g')
LINK=$(echo "$TITLE_LINE" | sed 's/.*<a href="\([^"]*\)".*/\1/')
POINTS=$(echo "$HN_PAGE" | grep '<span class="score"' | head -n 1 | sed 's/<[^>]*>//g' | sed 's/ .*//g')

# Display the extracted information
echo "Title: $TITLE"
echo "Link: $LINK"
echo "Points: $POINTS"