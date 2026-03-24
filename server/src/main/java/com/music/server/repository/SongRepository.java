package com.music.server.repository;

import com.music.server.model.Song;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

@Repository
public interface SongRepository extends JpaRepository<Song, Long> {
    // Spring magically implements this query for us!
    boolean existsByFilePath(String filePath); 
}
