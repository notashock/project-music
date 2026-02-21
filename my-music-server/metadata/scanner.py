import os
import json
from mutagen.mp3 import MP3
from mutagen.id3 import ID3, APIC

def scan_music(folder_path):
    library = []
    # Create thumbnails directory if it doesn't exist
    thumb_dir = "thumbnails"
    if not os.path.exists(thumb_dir):
        os.makedirs(thumb_dir)

    # Walk through the folder (including subfolders)
    for root, dirs, files in os.walk(folder_path):
        for file in files:
            if file.lower().endswith(".mp3"):
                file_path = os.path.join(root, file)
                song_info = {
                    "filename": file,
                    "full_path": file_path,
                    "title": "Unknown Title",
                    "artist": "Unknown Artist",
                    "album": "Unknown Album",
                    "thumbnail_path": None
                }

                try:
                    # 1. Extract Metadata
                    audio = MP3(file_path, ID3=ID3)
                    tags = audio.tags
                    
                    if tags:
                        song_info["title"] = str(tags.get("TIT2", file))
                        song_info["artist"] = str(tags.get("TPE1", "Unknown Artist"))
                        song_info["album"] = str(tags.get("TALB", "Unknown Album"))

                        # 2. Extract Thumbnail (APIC tag)
                        for tag in tags.values():
                            if isinstance(tag, APIC):
                                # Generate a safe filename for the image
                                thumb_name = f"{song_info['title']}_{song_info['artist']}".replace(" ", "_")
                                thumb_filename = f"{thumb_name}.jpg"
                                thumb_full_path = os.path.join(thumb_dir, thumb_filename)

                                # Save binary data to image file
                                with open(thumb_full_path, "wb") as img_file:
                                    img_file.write(tag.data)
                                
                                song_info["thumbnail_path"] = thumb_full_path
                                break 
                except Exception as e:
                    print(f"Error processing {file}: {e}")

                library.append(song_info)

    # 3. Save mapping to JSON
    with  open("library.json", "w", encoding="utf-8") as f:
        json.dump(library, f, indent=4)
    
    print(f"Done! Scanned {len(library)} songs. Check 'library.json' and the 'thumbnails' folder.")

# Run the script
user_path = input("Enter the path to your music folder: ")
scan_music(user_path)