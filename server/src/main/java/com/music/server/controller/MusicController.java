package com.music.server.controller;

import com.music.server.model.Song;
import com.music.server.repository.SongRepository;
import org.springframework.core.io.FileSystemResource;
import org.springframework.core.io.Resource;
import org.springframework.core.io.support.ResourceRegion;
import org.springframework.http.*;
import org.springframework.web.bind.annotation.*;

import java.io.File;
import java.io.IOException;
import java.util.List;
import java.util.Optional;

@RestController
@RequestMapping("/api")
public class MusicController {

    private final SongRepository songRepository;

    public MusicController(SongRepository songRepository) {
        this.songRepository = songRepository;
    }

    // 1. Endpoint to get the library list
    @GetMapping("/songs")
    public ResponseEntity<List<Song>> getAllSongs() {
        return ResponseEntity.ok(songRepository.findAll());
    }

    // 2. The Streaming Engine
    @GetMapping("/stream/{id}")
    public ResponseEntity<ResourceRegion> streamAudio(
            @PathVariable Long id, 
            @RequestHeader HttpHeaders headers) throws IOException {
        
        Optional<Song> songOptional = songRepository.findById(id);
        if (songOptional.isEmpty()) {
            return ResponseEntity.notFound().build();
        }

        File file = new File(songOptional.get().getFilePath());
        if (!file.exists()) {
            return ResponseEntity.status(HttpStatus.NOT_FOUND).build();
        }

        Resource resource = new FileSystemResource(file);
        long contentLength = resource.contentLength();
        
        // We chunk the file into 1MB pieces. 
        // This keeps RAM usage incredibly low on your system.
        long chunkSize = 1024 * 1024; 
        
        ResourceRegion region;
        HttpRange range = headers.getRange().isEmpty() ? null : headers.getRange().get(0);

        if (range != null) {
            long start = range.getRangeStart(contentLength);
            long end = range.getRangeEnd(contentLength);
            long rangeLength = Math.min(chunkSize, end - start + 1);
            region = new ResourceRegion(resource, start, rangeLength);
        } else {
            long rangeLength = Math.min(chunkSize, contentLength);
            region = new ResourceRegion(resource, 0, rangeLength);
        }

        return ResponseEntity.status(HttpStatus.PARTIAL_CONTENT)
                .contentType(MediaTypeFactory.getMediaType(resource).orElse(MediaType.APPLICATION_OCTET_STREAM))
                .body(region);
    }
}