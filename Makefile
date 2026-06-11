# Define variables
SRC_DIR := src
BUILD_DIR := build
SRC_FILES := $(shell find $(SRC_DIR) -type f)
VERSION:=$(shell grep em:version src/install.rdf | sed -n 's/.*<em:version>\(.*\)<\/em:version>.*/\1/p')
ZIP_FILE_NAME := zotmeta-$(VERSION).xpi
ZIP_FILE_PATH := $(BUILD_DIR)/$(ZIP_FILE_NAME)
JSON_FILE := updates.json
NODE ?= node

.PHONY: all test clean

# Default target
all: test $(ZIP_FILE_PATH) $(JSON_FILE)

test:
	$(NODE) tests/run-tests.js

# Target to zip all files in the source folder
$(ZIP_FILE_PATH): $(SRC_FILES) | $(BUILD_DIR)
	(cd $(SRC_DIR) && zip -r $(abspath $@) .)

# Target to generate a updates.json file
$(JSON_FILE): updates.json.tmpl $(ZIP_FILE_PATH) | $(BUILD_DIR)
	jq ".addons[\"zotmeta@roadtodream.tech\"].updates[0].update_hash = \"sha256:`shasum -a 256 $(ZIP_FILE_PATH) | cut -d' ' -f1`\"" updates.json.tmpl | \
		jq ".addons[\"zotmeta@roadtodream.tech\"].updates[0].update_link = \"https://github.com/RoadToDream/ZotMeta/releases/download/v$(VERSION)/$(ZIP_FILE_NAME)\"" | \
	jq ".addons[\"zotmeta@roadtodream.tech\"].updates[0].version = \"${VERSION}\"" > $@

# Create the build directory if it doesn't exist
$(BUILD_DIR):
	mkdir -p $(BUILD_DIR)

# Clean up generated files
clean:
	rm -rf $(BUILD_DIR) $(JSON_FILE)
