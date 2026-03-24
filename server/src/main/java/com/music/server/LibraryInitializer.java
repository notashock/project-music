package com.music.server;

import com.music.server.service.MusicScannerService;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.CommandLineRunner;
import org.springframework.stereotype.Component;

@Component // This tells Spring to automatically detect and run this class
public class LibraryInitializer implements CommandLineRunner {

    private final MusicScannerService scannerService;

    // @Value automatically pulls the path from your application.properties!
    @Value("${music.library.path}")
    private String musicPath;

    public LibraryInitializer(MusicScannerService scannerService) {
        this.scannerService = scannerService;
    }

    @Override
    public void run(String... args) {
        System.out.println("=====================================");
        System.out.println("🎵 INITIALIZING MUSIC SERVER 🎵");
        System.out.println("Target Directory: " + musicPath);
        System.out.println("=====================================");
        
        // Trigger the scan!
        // scannerService.scanFolder(musicPath);
        System.out.println("Scanned skipped");
        
        System.out.println("=====================================");
        System.out.println("✅ DATABASE READY. SERVER IS IDLING.");
        System.out.println("=====================================");
    }
}
