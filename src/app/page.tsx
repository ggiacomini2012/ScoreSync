'use client';

import { useState, useRef, useCallback, useEffect, type ChangeEvent, type DragEvent } from 'react';
import { OpenSheetMusicDisplay } from 'opensheetmusicdisplay';
import * as Tone from 'tone';
import JSZip from 'jszip';
import { Play, Pause, Square, UploadCloud, FileMusic, Loader2 } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardDescription } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';

export default function ScoreSyncPage() {
    const [osmd, setOsmd] = useState<OpenSheetMusicDisplay | null>(null);
    const [scoreTitle, setScoreTitle] = useState<string>('');
    const [isLoading, setIsLoading] = useState<boolean>(false);
    const [isPlayerReady, setIsPlayerReady] = useState<boolean>(false);
    const [isPlaying, setIsPlaying] = useState<boolean>(false);
    const [fileLoaded, setFileLoaded] = useState<boolean>(false);
    const [isDragging, setIsDragging] = useState(false);

    const scoreContainerRef = useRef<HTMLDivElement>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const playerRef = useRef<{ synth: Tone.PolySynth } | null>(null);
    const { toast } = useToast();

    useEffect(() => {
        if (scoreContainerRef.current && !osmd) {
            const osmdInstance = new OpenSheetMusicDisplay(scoreContainerRef.current, {
                autoResize: true,
                backend: 'svg',
                drawTitle: false,
                followCursor: true,
                cursorOptions: {
                    type: 2,
                    color: "hsl(var(--accent))",
                    alpha: 0.6,
                    follow: true,
                }
            });
            setOsmd(osmdInstance);
        }
        return () => {
             if (Tone.Transport.state !== 'stopped') {
                Tone.Transport.stop();
                Tone.Transport.cancel();
            }
            playerRef.current?.synth.dispose();
        }
    }, [osmd]);

    const stopPlayback = useCallback(() => {
        if (!isPlayerReady) return;
        Tone.Transport.stop();
        Tone.Transport.cancel();
        osmd?.cursor.reset();
        osmd?.cursor.hide();
        setIsPlaying(false);
    }, [isPlayerReady, osmd]);

    const setupPlayback = useCallback(() => {
        if (!osmd) return;

        try {
            const synth = new Tone.PolySynth(Tone.Synth, {
                envelope: { attack: 0.02, decay: 0.1, sustain: 0.3, release: 1 },
            }).toDestination();
            playerRef.current = { synth };

            Tone.Transport.cancel();
            osmd.cursor.reset();
            osmd.cursor.hide();
            let time = 0;
            
            while(!osmd.cursor.isAtEnd) {
                const notes = osmd.cursor.NotesUnderCursor();
                if (notes.length > 0 && notes[0].Pitch) {
                    const duration = notes[0].Length.RealValue * 1.8;
                    const pitches = notes.flatMap(n => n.Pitch ? `${n.Pitch.FundamentalNote}${n.Pitch.Accidental ?? ''}${n.Pitch.Octave}` : []);
                    
                    if (pitches.length > 0) {
                        Tone.Transport.scheduleOnce(t => {
                            playerRef.current?.synth.triggerAttackRelease(pitches, duration, t);
                        }, time);
                    }
                    
                    const currentIterator = osmd.cursor.iterator.clone();
                    Tone.Transport.scheduleOnce(t => {
                        Tone.Draw.schedule(() => {
                            osmd.cursor.iterator = currentIterator;
                            osmd.cursor.show();
                        }, t);
                    }, time);

                    time += duration;
                }
                osmd.cursor.next();
            }

            Tone.Transport.scheduleOnce(t => {
                Tone.Draw.schedule(() => stopPlayback(), t);
            }, time);

            osmd.cursor.reset();
            osmd.cursor.hide();
            setIsPlayerReady(true);
        } catch(e) {
            console.error("Error setting up playback:", e);
            toast({
                variant: "destructive",
                title: "Playback Error",
                description: "Could not prepare audio for this score.",
            });
            setIsPlayerReady(false);
        }
    }, [osmd, toast, stopPlayback]);

    const handleFileUpload = useCallback(async (file: File) => {
        if (!osmd || !file) return;

        setIsLoading(true);
        setFileLoaded(false);
        setIsPlayerReady(false);
        setScoreTitle('');
        stopPlayback();

        try {
            const zip = await JSZip.loadAsync(file);
            const xmlFile = Object.values(zip.files).find(f => (f.name.endsWith('.xml') || f.name.endsWith('.musicxml')) && !f.name.startsWith('META-INF/'));
            
            if (!xmlFile) throw new Error("No MusicXML file found in the MXL container.");

            const xmlContent = await xmlFile.async('string');
            
            await osmd.load(xmlContent);
            await new Promise(resolve => setTimeout(resolve, 0)); // Yield to allow UI update
            await osmd.render();

            setScoreTitle(osmd.sheet.TitleString || file.name.replace(/\.(mxl|xml|musicxml)$/, ''));
            setFileLoaded(true);

            setupPlayback();
        } catch (error) {
            console.error("Error processing MXL file:", error);
            toast({
                variant: "destructive",
                title: "Error loading file",
                description: error instanceof Error ? error.message : "An unknown error occurred.",
            });
        } finally {
            setIsLoading(false);
        }
    }, [osmd, toast, setupPlayback, stopPlayback]);
    
    const togglePlay = useCallback(async () => {
        if (!isPlayerReady) return;
        if (Tone.context.state !== 'running') await Tone.start();
        if (isPlaying) Tone.Transport.pause();
        else Tone.Transport.start();
        setIsPlaying(!isPlaying);
    }, [isPlayerReady, isPlaying]);

    const handleDragEnter = (e: DragEvent<HTMLDivElement>) => { e.preventDefault(); e.stopPropagation(); setIsDragging(true); };
    const handleDragLeave = (e: DragEvent<HTMLDivElement>) => { e.preventDefault(); e.stopPropagation(); setIsDragging(false); };
    const handleDragOver = (e: DragEvent<HTMLDivElement>) => { e.preventDefault(); e.stopPropagation(); };
    const handleDrop = useCallback((e: DragEvent<HTMLDivElement>) => {
        e.preventDefault(); e.stopPropagation(); setIsDragging(false);
        if (e.dataTransfer.files?.[0]) {
            const file = e.dataTransfer.files[0];
            if (file.name.endsWith('.mxl')) handleFileUpload(file);
            else toast({ variant: "destructive", title: "Invalid File Type", description: "Please upload a .mxl file." });
        }
    }, [handleFileUpload, toast]);

    const handleFileSelect = (e: ChangeEvent<HTMLInputElement>) => {
        if (e.target.files?.[0]) handleFileUpload(e.target.files[0]);
        e.target.value = ''; // Reset for re-uploading same file
    };

    const triggerFileSelect = () => fileInputRef.current?.click();

    return (
        <div 
            className="flex flex-col items-center min-h-screen bg-background text-foreground p-4 md:p-6 font-body"
            onDragEnter={handleDragEnter}
            onDragLeave={handleDragLeave}
            onDragOver={handleDragOver}
            onDrop={handleDrop}
        >
            <header className="w-full max-w-7xl text-center mb-6">
                <h1 className="text-4xl md:text-5xl font-headline font-bold text-primary">ScoreSync</h1>
                <p className="text-muted-foreground mt-2">Upload, visualize, and listen to your sheet music.</p>
            </header>

            <main className="w-full max-w-7xl flex-grow flex flex-col items-center justify-center">
                {!fileLoaded && !isLoading && (
                    <div
                        onClick={triggerFileSelect}
                        className={cn(
                            "w-full max-w-2xl h-80 rounded-lg border-2 border-dashed flex flex-col items-center justify-center text-center p-8 transition-all duration-300 cursor-pointer hover:border-accent hover:bg-white/5",
                            isDragging && 'border-accent ring-2 ring-accent bg-accent/10'
                        )}
                    >
                        <UploadCloud className="w-16 h-16 text-muted-foreground mb-4" />
                        <h2 className="text-2xl font-semibold">Drag & Drop your MXL file here</h2>
                        <p className="text-muted-foreground mt-2">or click to browse</p>
                        <input
                            type="file"
                            ref={fileInputRef}
                            onChange={handleFileSelect}
                            accept=".mxl"
                            className="hidden"
                        />
                    </div>
                )}
                
                {isLoading && (
                    <div className="flex flex-col items-center justify-center text-center">
                        <Loader2 className="w-16 h-16 animate-spin text-primary mb-4" />
                        <p className="text-xl">Loading your score...</p>
                    </div>
                )}
                
                {fileLoaded && !isLoading && (
                    <Card className="w-full h-full flex flex-col shadow-lg overflow-hidden" style={{minHeight: '60vh'}}>
                        <CardHeader className="flex-row items-center justify-between bg-card-foreground/5 p-4 border-b">
                            <div className="flex items-center gap-3">
                                <FileMusic className="w-6 h-6 text-primary" />
                                <CardDescription className="text-lg font-semibold text-foreground truncate">{scoreTitle}</CardDescription>
                            </div>
                            {isPlayerReady && (
                                <div className="flex items-center gap-2">
                                    <Button variant="ghost" size="icon" onClick={togglePlay} disabled={!isPlayerReady}>
                                        {isPlaying ? <Pause className="w-6 h-6" /> : <Play className="w-6 h-6" />}
                                    </Button>
                                    <Button variant="ghost" size="icon" onClick={stopPlayback} disabled={!isPlayerReady}>
                                        <Square className="w-6 h-6" />
                                    </Button>
                                </div>
                            )}
                        </CardHeader>
                        <CardContent className="flex-grow p-2 md:p-4 bg-white relative">
                            <div ref={scoreContainerRef} className="w-full h-full min-h-[50vh] [&_svg]:max-w-none" />
                        </CardContent>
                    </Card>
                )}
            </main>
             <footer className="w-full text-center mt-6">
                <p className="text-sm text-muted-foreground">Made with <span className="text-red-500">♥</span> and modern web technologies.</p>
                <Button variant="link" size="sm" onClick={() => { setFileLoaded(false); setIsLoading(false); setScoreTitle(''); setIsPlaying(false); setIsPlayerReady(false); if (osmd) { osmd.clear(); stopPlayback(); } }} className={cn(!fileLoaded && "invisible")}>Upload another file</Button>
            </footer>
        </div>
    );
}
