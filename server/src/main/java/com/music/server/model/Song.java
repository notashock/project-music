package com.music.server.model;

import jakarta.persistence.*;
import lombok.Data;

@Entity
@Data // Lombok automatically generates getters and setters for us
public class Song {
    
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    private String title;
    private String artist;
    private String album;
    
    @Column(length = 1000) // File paths can sometimes be long
    private String filePath;
    
    @Column(length = 1000)
    private String thumbnailPath;
}