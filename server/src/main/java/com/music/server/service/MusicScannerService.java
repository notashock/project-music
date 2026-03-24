package com.music.server.service;

import com.music.server.model.Song;
import com.music.server.repository.SongRepository;
import org.jaudiotagger.audio.AudioFile;
import org.jaudiotagger.audio.AudioFileIO;
import org.jaudiotagger.tag.FieldKey;
import org.jaudiotagger.tag.Tag;
import org.jaudiotagger.tag.images.Artwork;
import org.springframework.stereotype.Service;

import java.io.File;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.util.stream.Stream;

@Service
public class MusicScannerService {

    private final SongRepository songRepository;
    private final String THUMBNAIL_DIR = "./music-data/thumbnails/";

    public MusicScannerService(SongRepository songRepository) {
        this.songRepository = songRepository;
        // Ensure thumbnail directory exists
        new File(THUMBNAIL_DIR).mkdirs();
    }

    public void scanFolder(String rootPath) {
        System.out.println("Starting scan in: " + rootPath);

        try (Stream<Path> paths = Files.walk(Paths.get(rootPath))) {
            paths.filter(Files::isRegularFile)
                 .filter(p -> p.toString().toLowerCase().endsWith(".mp3"))
                 .forEach(this::processAudioFile);
                 
            System.out.println("Scan complete!");
        } catch (Exception e) {
            System.err.println("Failed to scan folder: " + e.getMessage());
        }
    }

    private void processAudioFile(Path filePath) {
        String absolutePath = filePath.toAbsolutePath().toString();

        // Skip if we already scanned this file
        if (songRepository.existsByFilePath(absolutePath)) {
            return; 
        }

        try {
            File file = filePath.toFile();
            AudioFile audioFile = AudioFileIO.read(file);
            Tag tag = audioFile.getTag();

            Song song = new Song();
            song.setFilePath(absolutePath);
            song.setTitle(file.getName()); // Fallback
            song.setArtist("Unknown Artist"); // Fallback
            song.setAlbum("Unknown Album"); // Fallback

            if (tag != null) {
                if (tag.getFirst(FieldKey.TITLE) != null && !tag.getFirst(FieldKey.TITLE).isEmpty()) {
                    song.setTitle(tag.getFirst(FieldKey.TITLE));
                }
                if (tag.getFirst(FieldKey.ARTIST) != null && !tag.getFirst(FieldKey.ARTIST).isEmpty()) {
                    song.setArtist(tag.getFirst(FieldKey.ARTIST));
                }
                if (tag.getFirst(FieldKey.ALBUM) != null && !tag.getFirst(FieldKey.ALBUM).isEmpty()) {
                    song.setAlbum(tag.getFirst(FieldKey.ALBUM));
                }

                // Extract Album Art
                Artwork artwork = tag.getFirstArtwork();
                if (artwork != null) {
                    String thumbName = (song.getAlbum() + "_" + song.getArtist()).replaceAll("[^a-zA-Z0-9.-]", "_") + ".jpg";
                    File thumbFile = new File(THUMBNAIL_DIR + thumbName);
                    
                    if (!thumbFile.exists()) {
                        Files.write(thumbFile.toPath(), artwork.getBinaryData());
                    }
                    song.setThumbnailPath(thumbFile.getAbsolutePath());
                }
            }

            songRepository.save(song);
            System.out.println("Added: " + song.getTitle());

        } catch (Exception e) {
            System.err.println("Could not process file: " + absolutePath + " - " + e.getMessage());
        }
    }
}