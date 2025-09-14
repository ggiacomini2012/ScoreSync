'use client';

import React, { useState, useRef, useCallback, useEffect } from 'react';
import { OpenSheetMusicDisplay, PointF2D } from 'opensheetmusicdisplay';
import * as Tone from 'tone';
import JSZip from 'jszip';
import { Play, Pause, Square, UploadCloud, FileMusic, Loader2 } from 'lucide-react';
import { Piano } from '@tonejs/piano';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Toaster } from '@/components/ui/toaster';
import { useToast } from '@/hooks/use-toast';
import { Progress } from '@/components/ui/progress';
import { Slider } from '@/components/ui/slider';
import { Label } from '@/components/ui/label';

// Vexflow registers a service worker which can cause issues in some environments.
// We can disable it here.
if (typeof window !== 'undefined') {
  (window as any).VEXFLOW_BACKEND = 'canvas';
}

// Tone.js requires a user interaction to start the audio context.
const startAudioContext = async () => {
  if (Tone.context.state !== 'running') {
    await Tone.context.resume();
    await Tone.start();
  }
};


export default function ScoreSyncPage() {
  const { toast } = useToast();
  const [osmd, setOsmd] = useState<OpenSheetMusicDisplay | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [loadingMessage, setLoadingMessage] = useState('');
  const [isPlaying, setIsPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [isPianoLoaded, setIsPianoLoaded] = useState(false);
  const [tempo, setTempo] = useState(120);
  const [fileName, setFileName] = useState<string | null>(null);
  const [foregroundColor, setForegroundColor] = useState('black');

  const sheetContainerRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const playerRef = useRef<{ transport: typeof Tone.Transport, part: Tone.Part, piano: Piano } | null>(null);
  const cursorRef = useRef<{ osmdCursor: any, currentPlayheadPosition: number } | null>(null);

  const cleanup = useCallback(() => {
    console.log('Cleaning up resources...');
    if (playerRef.current) {
      playerRef.current.transport.stop();
      playerRef.current.transport.cancel();
      playerRef.current.part.dispose();
      if (playerRef.current.piano?.loaded) {
          playerRef.current.piano.dispose();
      }
      playerRef.current = null;
    }
    if (osmd) {
      osmd.clear();
    }
    if (cursorRef.current) {
        cursorRef.current.osmdCursor = null;
    }
    setIsPlaying(false);
    setProgress(0);
  }, [osmd]);


  const handleFileUpload = async (file: File) => {
    if (!file) return;

    cleanup();
    setIsLoading(true);
    setFileName(file.name);
    setLoadingMessage('Reading file...');

    try {
      const isMxl = file.name.endsWith('.mxl');
      let scoreXml: string;

      if (isMxl) {
        setLoadingMessage('Unzipping .mxl file...');
        const zip = new JSZip();
        const content = await zip.loadAsync(await file.arrayBuffer());
        const containerFile = await content.file('META-INF/container.xml')?.async('string');

        if (!containerFile) {
          throw new Error('Invalid .mxl file: missing META-INF/container.xml');
        }

        const rootFilePathMatch = containerFile.match(/full-path="([^"]+)"/);
        if (!rootFilePathMatch) {
          throw new Error('Invalid .mxl file: could not find root file path in container.xml');
        }

        scoreXml = await content.file(rootFilePathMatch[1])?.async('string') ?? '';
      } else {
        scoreXml = await file.text();
      }

      if (!scoreXml) {
        throw new Error('Failed to read the music score file.');
      }
      
      setLoadingMessage('Initializing music display...');
      const currentOsmd = new OpenSheetMusicDisplay(sheetContainerRef.current!, {
        autoResize: true,
        backend: 'svg',
        drawTitle: true,
        drawingParameters: {
          defaultColor: foregroundColor,
        }
      });
      setOsmd(currentOsmd);
      
      setLoadingMessage('Loading score...');
      await currentOsmd.load(scoreXml);

      setLoadingMessage('Rendering score...');
      currentOsmd.render();
      
      setLoadingMessage('Preparing for playback...');
      const cursor = currentOsmd.cursor;
      cursor.show();
      cursorRef.current = { osmdCursor: cursor, currentPlayheadPosition: 0 };


      // Create Tone.js player
      setLoadingMessage('Setting up audio playback...');
      const notes: { time: number; pitch: string; duration: number }[] = [];
      currentOsmd.sheet.Instruments.forEach(instrument => {
        instrument.Voices.forEach(voice => {
          voice.VoiceEntries.forEach(voiceEntry => {
            if (voiceEntry.AbsoluteTimestamp) {
                voiceEntry.Notes.forEach(note => {
                    if (note.pitch) {
                        notes.push({
                            time: voiceEntry.AbsoluteTimestamp.RealValue,
                            pitch: Tone.Frequency(note.pitch.halfTone).toNote(),
                            duration: note.Length.RealValue,
                        });
                    }
                });
            }
          });
        });
      });

      setLoadingMessage('Loading piano samples...');
      const piano = new Piano({
        velocities: 4,
      }).toDestination();
      
      await piano.load();

      setIsPianoLoaded(true);
      setLoadingMessage('Preparing playback...');

      const part = new Tone.Part((time, value) => {
        piano.keyDown({ note: value.pitch, time, velocity: 0.9 });
        piano.keyUp({ note: value.pitch, time: time + value.duration * 0.9 });
      }, notes).start(0);

      const lastNote = notes[notes.length - 1];
      const totalTime = lastNote ? lastNote.time + lastNote.duration : 0;
      Tone.Transport.setLoopPoints(0, totalTime);
      Tone.Transport.loop = true;
      Tone.Transport.bpm.value = tempo;
      
      playerRef.current = { transport: Tone.Transport, part, piano };

      setLoadingMessage('');

    } catch (error) {
      console.error('Error processing file:', error);
      toast({
        variant: 'destructive',
        title: 'Error loading file',
        description: error instanceof Error ? error.message : String(error),
      });
      setFileName(null);
    } finally {
      setIsLoading(false);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  };
  
  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFileUpload(e.dataTransfer.files[0]);
    }
  };

  const togglePlay = async () => {
    if (!osmd || !playerRef.current) return;
    
    await startAudioContext();
    
    const { transport } = playerRef.current;

    if (isPlaying) {
      transport.pause();
    } else {
      transport.start();
    }
    setIsPlaying(!isPlaying);
  };
  
  const stopPlayback = () => {
    if (!osmd || !playerRef.current) return;
    playerRef.current.transport.stop();
    setIsPlaying(false);
    if (cursorRef.current?.osmdCursor) {
      cursorRef.current.osmdCursor.reset();
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      handleFileUpload(e.target.files[0]);
    }
  };

  const triggerFileSelect = () => {
    fileInputRef.current?.click();
  };

  useEffect(() => {
    // On component mount, get the foreground color from the CSS variables.
    const color = getComputedStyle(document.documentElement).getPropertyValue('--foreground');
    // The color is in HSL format 'h s% l%', we need to convert it to 'hsl(h, s%, l%)'
    if (color) {
        const hslColor = `hsl(${color.replace(/ /g, ', ')})`;
        setForegroundColor(hslColor);
    }
  }, []);
  
  useEffect(() => {
    let animationFrameId: number;
    const cursor = cursorRef.current?.osmdCursor;

    const updateProgressAndCursor = () => {
      if (isPlaying && playerRef.current && osmd && cursor) {
        // Update progress bar
        const progressValue = playerRef.current.transport.progress * 100;
        setProgress(progressValue);

        // Smooth cursor update
        if (!cursor.iterator.EndReached) {
            const currentTime = playerRef.current.transport.seconds;
            const nextNoteTimestamp = cursor.iterator.CurrentSourceTimestamp;

            if (nextNoteTimestamp && currentTime >= nextNoteTimestamp.RealValue) {
                cursor.next();
            }
        }

      }
      animationFrameId = requestAnimationFrame(updateProgressAndCursor);
    };

    if (isPlaying) {
      if (cursor) {
        cursor.show();
      }
      animationFrameId = requestAnimationFrame(updateProgressAndCursor);
    } else {
      setProgress(0);
      if (cursor) {
        cursor.hide();
        cursor.reset();
      }
    }

    const transport = playerRef.current?.transport;
    const loopCallback = () => {
        if (cursor) {
            cursor.reset();
        }
    }
    transport?.on('loop', loopCallback);


    return () => {
      cancelAnimationFrame(animationFrameId);
      transport?.off('loop', loopCallback);
    };
  }, [isPlaying, osmd]);

  useEffect(() => {
    if (playerRef.current) {
        playerRef.current.transport.bpm.value = tempo;
    }
  }, [tempo]);

  return (
    <>
      <div 
        className="flex flex-col items-center justify-center min-h-screen bg-background text-foreground p-4"
        onDragOver={handleDragOver}
        onDrop={handleDrop}
      >
        <Card className="w-full max-w-4xl shadow-2xl">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileMusic className="w-8 h-8 text-primary" />
              ScoreSync
            </CardTitle>
            <CardDescription>
              Upload a MusicXML file (.musicxml, .xml, or .mxl) to display and play the score.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {!osmd && !isLoading && (
              <div
                className="flex flex-col items-center justify-center border-2 border-dashed border-border rounded-lg p-12 text-center cursor-pointer hover:border-primary transition-colors"
                onClick={triggerFileSelect}
              >
                <UploadCloud className="w-16 h-16 text-muted-foreground mb-4" />
                <p className="font-semibold">Click to upload or drag and drop</p>
                <p className="text-sm text-muted-foreground">Supported formats: .musicxml, .xml, .mxl</p>
              </div>
            )}
            {isLoading && (
              <div className="flex flex-col items-center justify-center p-12">
                <Loader2 className="w-16 h-16 text-primary animate-spin mb-4" />
                <p className="font-semibold">{loadingMessage}</p>
                {fileName && <p className="text-sm text-muted-foreground mt-2">{fileName}</p>}
              </div>
            )}

            <div ref={sheetContainerRef} className={`score-container ${osmd ? 'my-4' : 'hidden'}`} />
            
            {osmd && !isLoading && (
               <div className="mt-4">
                  <div className="flex items-center gap-4">
                    <Button onClick={togglePlay} disabled={!osmd || !isPianoLoaded}>
                      {isPlaying ? <Pause /> : <Play />}
                      <span className="ml-2">{isPlaying ? 'Pause' : 'Play'}</span>
                    </Button>
                    <Button onClick={stopPlayback} disabled={!osmd || !isPlaying || !isPianoLoaded} variant="outline">
                      <Square />
                      <span className="ml-2">Stop</span>
                    </Button>
                    <Progress value={progress} className="w-full" />
                 </div>
                 <div className="grid gap-2 mt-4">
                    <Label htmlFor="tempo">Tempo: {tempo} BPM</Label>
                    <Slider
                        id="tempo"
                        min={30}
                        max={300}
                        step={1}
                        value={[tempo]}
                        onValueChange={(value) => setTempo(value[0])}
                        disabled={!osmd || !isPianoLoaded}
                    />
                 </div>
                 <div className="mt-4 flex justify-center">
                    <Button onClick={triggerFileSelect} variant="secondary">
                        <UploadCloud className="mr-2 h-4 w-4" />
                        Upload another file
                    </Button>
                 </div>
               </div>
            )}
            <input
              type="file"
              ref={fileInputRef}
              className="hidden"
              onChange={handleFileSelect}
              accept=".musicxml,.xml,.mxl"
            />
          </CardContent>
        </Card>
      </div>
      <Toaster />
    </>
  );
}
