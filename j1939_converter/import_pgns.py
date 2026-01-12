import json
import re
import os

# Configuration
JSON_FILE = 'pgn_import.json'
HTML_FILE = 'j1939_converter.html'

def load_json_data(filepath):
    """Load and parse the JSON file."""
    try:
        with open(filepath, 'r', encoding='utf-8') as f:
            data = json.load(f)
        print(f"Loaded {len(data)} entries from {filepath}")
        return data
    except Exception as e:
        print(f"Error loading JSON: {e}")
        return None

def format_entry(entry):
    """Format a single JSON entry into a JS object string."""
    try:
        # Convert hex string to integer
        pgn_hex_str = entry.get('pgn_hex', '0').strip()
        pgn_int = int(pgn_hex_str, 16)
        
        label = entry.get('label', 'Unknown').replace('"', '\\"')
        
        # Create JS object string: { pgn: 65049, name: "Label", acronym: "N/A" }
        return f'    {{ pgn: {pgn_int}, name: "{label}", acronym: "N/A" }}'
    except ValueError:
        print(f"Skipping invalid entry: {entry}")
        return None

def update_html(html_path, new_entries):
    """Update the HTML file with new PGN entries."""
    try:
        with open(html_path, 'r', encoding='utf-8') as f:
            content = f.read()

        # Regex to find the end of the pgnDatabase array
        pattern = r'(const\s+pgnDatabase\s*=\s*\[)([\s\S]*?)(\s*\];)'
        
        match = re.search(pattern, content)
        if not match:
            print("Could not find pgnDatabase array in HTML file.")
            return

        existing_block = match.group(2)
        
        # Find all existing PGN IDs to avoid duplicates
        # Matches "pgn: 12345" or "pgn:12345"
        existing_pgns = set()
        for pgn_match in re.finditer(r'pgn:\s*(\d+)', existing_block):
            existing_pgns.add(int(pgn_match.group(1)))
        
        print(f"Found {len(existing_pgns)} existing PGNs in the database.")

        # Prepare the new content to insert
        formatted_entries = []
        skipped_count = 0
        
        for entry in new_entries:
            # Check for duplicate before formatting
            try:
                pgn_hex_str = entry.get('pgn_hex', '0').strip()
                pgn_int = int(pgn_hex_str, 16)
                
                if pgn_int in existing_pgns:
                    skipped_count += 1
                    continue
                    
                formatted = format_entry(entry)
                if formatted:
                    formatted_entries.append(formatted)
                    # Add to set so we don't add duplicates from the JSON itself
                    existing_pgns.add(pgn_int)
            except ValueError:
                continue
        
        if skipped_count > 0:
            print(f"Skipped {skipped_count} duplicate entries.")

        if not formatted_entries:
            print("No new unique entries to add.")
            return

        # Create the insertion string
        insertion = ",\n" + ",\n".join(formatted_entries)
        
        # Insert before the closing bracket of the array
        # match.group(1) is the start "const ... ["
        # match.group(2) is the content
        # match.group(3) is the end "];"
        
        # specific insertion point is right before the closing bracket group starts
        insert_pos = match.start(3)
        
        new_content = content[:insert_pos] + insertion + content[insert_pos:]
        
        with open(html_path, 'w', encoding='utf-8') as f:
            f.write(new_content)
            
        print(f"Successfully added {len(formatted_entries)} new entries to {html_path}")

    except Exception as e:
        print(f"Error updating HTML: {e}")

def main():
    if not os.path.exists(JSON_FILE):
        print(f"File not found: {JSON_FILE}")
        return
    
    if not os.path.exists(HTML_FILE):
        print(f"File not found: {HTML_FILE}")
        return

    data = load_json_data(JSON_FILE)
    if data:
        # Check if data is a list of lists (e.g. [[{...}, {...}]])
        if isinstance(data, list) and len(data) > 0 and isinstance(data[0], list):
            print("Detected nested list structure. Flattening...")
            flat_data = []
            for item in data:
                if isinstance(item, list):
                    flat_data.extend(item)
            data = flat_data
            print(f"Flattened data contains {len(data)} entries.")

        update_html(HTML_FILE, data)

if __name__ == "__main__":
    main()
