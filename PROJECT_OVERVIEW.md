# ScoreSync Project Overview

This document provides a comprehensive overview of the ScoreSync project, including its purpose, technical architecture, core features, and potential areas for improvement.

## 1. Project Overview

ScoreSync is a web-based application designed to serve as a personal sheet music reader. It allows users to upload, view, and listen to digital sheet music in a simple and intuitive interface. The project aims to provide a clean, minimalist design to help musicians focus on their music.

## 2. Technical Architecture

The project is built on a modern web technology stack:

*   **Frontend Framework:** [Next.js](https://nextjs.org/) (a React framework)
*   **Language:** [TypeScript](https://www.typescriptlang.org/)
*   **Styling:** [Tailwind CSS](https://tailwindcss.com/) with [Shadcn UI](https://ui.shadcn.com/) components
*   **Music Notation Rendering:** [OpenSheetMusicDisplay (OSMD)](https://opensheetmusicdisplay.org/)
*   **Audio Playback:** [Tone.js](https://tonejs.github.io/)
*   **File Handling:** [JSZip](https://stuk.github.io/jszip/) for handling compressed `.mxl` files

The application is structured as a single-page application (SPA) where the main logic resides in the `src/app/page.tsx` file.

## 3. Core Features

### 3.1. File Upload

*   **Drag and Drop:** Users can drag and drop sheet music files onto the application window.
*   **File Selection:** Users can click on an upload area to select a file from their computer.
*   **Supported Formats:** The application supports MusicXML files with the following extensions: `.musicxml`, `.xml`, and `.mxl`.
*   **.mxl Support:** The application can unzip compressed `.mxl` files to extract the MusicXML data.

### 3.2. Score Visualization

*   The `OpenSheetMusicDisplay` library is used to render the sheet music from the uploaded file.
*   The score is rendered as an SVG image, allowing for high-quality, scalable visualization.
*   The application automatically resizes the score to fit the available space.

### 3.3. Audio Playback

*   **Playback Controls:** The application provides play, pause, and stop buttons to control the audio playback.
*   **Synthesizer:** `Tone.js` is used to generate audio from the sheet music data.
*   **Progress Bar:** A progress bar shows the current position of the playback.
*   **Cursor Synchronization:** A cursor highlights the current note being played in the score.

## 4. Potential Improvements and "Badly Formatted" Features

### 4.1. Cursor Synchronization

The current implementation for synchronizing the visual cursor with the audio playback is acknowledged in the code as a "hack." It may not be accurate for complex scores with multiple voices or intricate timing. This is a key area for improvement to enhance the user experience.

### 4.2. Error Handling

While the application has basic error handling for file uploads, it could be more robust. For example, providing more specific error messages to the user when a file is invalid or an error occurs during processing would be beneficial.

### 4.3. Code Structure and Maintainability

The main application logic is concentrated in the `src/app/page.tsx` file. To improve readability and maintainability, the code could be refactored by:

*   **Creating Custom Hooks:** The logic for handling `OpenSheetMusicDisplay` and `Tone.js` could be extracted into custom React hooks (e.g., `useOmsd`, `useTonePlayer`).
*   **Utility Functions:** General-purpose functions could be moved to the `src/lib/utils.ts` file.

### 4.4. Performance Optimization

For very large and complex sheet music files, the process of extracting notes and preparing the audio for playback could be slow, potentially causing the UI to freeze. This process could be optimized, for example, by using web workers to offload the heavy processing from the main thread.

### 4.5. Lack of Tests

The project currently lacks an automated testing suite. Adding unit tests for individual components and utility functions, as well as integration tests for the core user workflows, would significantly improve the project's quality and reduce the risk of regressions.

### 4.6. Hardcoded Values

Some values, such as the VexFlow backend, are hardcoded in the application. These could be made more configurable, for example, through environment variables or a settings interface.
