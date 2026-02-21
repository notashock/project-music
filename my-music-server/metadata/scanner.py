import os
import json
import pymongo
from mutagen.mp3 import MP3
from mutagen.id3 import ID3, APIC

# Initialize MongoDB Connection
# Using 127.0.0.1 is highly recommended to bypass local DNS lookup delays
client = pymongo.MongoClient("mongodb://127.0.0.1:27017/")
db = client["music_vault"]
collection = db["songs"]

def scan_music(folder_path):
    # Create thumbnails directory if it doesn't exist
    thumb_dir = "thumbnails"
    if not os.path.exists(thumb_dir):
        os.makedirs(thumb_dir)

    scanned_count = 0

    # Walk through the folder (including subfolders)
    for root, dirs, files in os.walk(folder_path):
        for file in files:
            if file.lower().endswith(".mp3"):
                file_path = os.path.join(root, file)
                
                # Base metadata structure
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
                                thumb_name = f"{song_info['title']}_{song_info['artist']}".replace(" ", "_").replace("/", "-")
                                thumb_filename = f"{thumb_name}.jpg"
                                thumb_full_path = os.path.join(thumb_dir, thumb_filename)

                                # Save binary data to image file on the hard drive
                                with open(thumb_full_path, "wb") as img_file:
                                    img_file.write(tag.data)
                                
                                # Only store the text path in the database
                                song_info["thumbnail_path"] = thumb_full_path
                                break 
                except Exception as e:
                    print(f"Error processing {file}: {e}")

                # 3. Save to MongoDB (Upsert Logic)
                # Matches by full_path so we don't create duplicates if you run the scanner twice
                collection.update_one(
                    {"full_path": song_info["full_path"]}, 
                    {"$set": song_info}, 
                    upsert=True
                )
                scanned_count += 1
    
    print(f"Boom! Scanned and synced {scanned_count} songs to MongoDB.")

# Run the script
user_path = input("Enter the path to your music folder: ")
scan_music(user_path)