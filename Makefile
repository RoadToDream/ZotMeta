# Define variables
SRC_DIR := src
BUILD_DIR := build
VERSION:=$(shell grep em:version src/install.rdf | head -n 1 | sed -e 's/ *<em:version>//' -e 's/<\/em:version>//')
ZIP_FILE_NAME := zotmeta-$(VERSION).xpi
ZIP_FILE_PATH := $(BUILD_DIR)/$(ZIP_FILE_NAME)
JSON_FILE := updates.json


# Default target
all: $(ZIP_FILE_PATH) $(JSON_FILE)

# Target to zip all files in the source folder
$(ZIP_FILE_PATH): | $(BUILD_DIR)
	(cd $(SRC_DIR) && zip -r $(abspath $@) .)

# Target to generate a updates.json file
$(JSON_FILE): | $(BUILD_DIR)
	jq ".addons[\"zotmeta@roadtodream.tech\"].updates[0].update_hash = \"sha256:`shasum -a 256 $(ZIP_FILE_PATH) | cut -d' ' -f1`\"" updates.json.tmpl | \
		jq ".addons[\"zotmeta@roadtodream.tech\"].updates[0].update_link = \"https://github.com/RoadToDream/ZotMeta/releases/download/v$(VERSION)/$(ZIP_FILE_NAME)\"" > $@

# Create the build directory if it doesn't exist
$(BUILD_DIR):
	mkdir -p $(BUILD_DIR)

# Clean up generated files
clean:
	rm -rf $(BUILD_DIR)