'use client';

import React, { useState, useRef, useCallback, useEffect } from 'react';
import { OpenSheetMusicDisplay, PointF2D } from 'opensheetmusicdisplay';
import * as Tone from 'tone';
import JSZip from 'jszip';
import { Play, Pause, Square, UploadCloud, FileMusic, Loader2 } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Toaster } from '@/components/ui/toaster';
import { useToast } from '@/hooks/use-toast';
import { Progress } from '@/components/ui/progress';

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
  const [fileName, setFileName] = useState<string | null>(null);

  const sheetContainerRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const playerRef = useRef<{ transport: typeof Tone.Transport, part: Tone.Part } | null>(null);
  const cursorRef = useRef<{ osmdCursor: any, currentPlayheadPosition: number } | null>(null);

  const cleanup = useCallback(() => {
    console.log('Cleaning up resources...');
    if (playerRef.current) {
      playerRef.current.transport.stop();
      playerRef.current.transport.cancel();
      playerRef.current.part.dispose();
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
          defaultColor: "#FFFFFF",
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
      
      const synth = new Tone.Synth().toDestination();
      const part = new Tone.Part((time, value) => {
        synth.triggerAttackRelease(value.pitch, value.duration, time);
        
        Tone.Draw.schedule(() => {
            if(cursorRef.current?.osmdCursor) {
                const timestamp = new PointF2D(time, 0);
                // This is a bit of a hack to sync the cursor. A more robust solution would be needed for complex scores.
                // We're essentially jumping the cursor to the current note's time.
                const voiceEntries = currentOsmd.sheet.Instruments[0].Voices[0].VoiceEntries;
                for(const voiceEntry of voiceEntries) {
                    if(voiceEntry.AbsoluteTimestamp.RealValue >= time) {
                        cursorRef.current.osmdCursor.iterator = voiceEntry.Notes[0].getIterator();
                        cursorRef.current.osmdCursor.update();
                        break;
                    }
                }
            }
        }, time);

      }, notes).start(0);

      const lastNote = notes[notes.length - 1];
      const totalTime = lastNote ? lastNote.time + lastNote.duration : 0;
      Tone.Transport.setLoopPoints(0, totalTime);
      Tone.Transport.loop = true;
      
      playerRef.current = { transport: Tone.Transport, part };

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
    let animationFrameId: number;

    const updateProgress = () => {
        if (isPlaying && playerRef.current && osmd) {
            const progressValue = (playerRef.current.transport.progress * 100);
            setProgress(progressValue);
        }
        animationFrameId = requestAnimationFrame(updateProgress);
    };

    if (isPlaying) {
        animationFrameId = requestAnimationFrame(updateProgress);
    } else {
        setProgress(0);
    }

    return () => {
        cancelAnimationFrame(animationFrameId);
    };
  }, [isPlaying, osmd]);

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
                    <Button onClick={togglePlay} disabled={!osmd}>
                      {isPlaying ? <Pause /> : <Play />}
                      <span className="ml-2">{isPlaying ? 'Pause' : 'Play'}</span>
                    </Button>
                    <Button onClick={stopPlayback} disabled={!osmd || !isPlaying} variant="outline">
                      <Square />
                      <span className="ml-2">Stop</span>
                    </Button>
                    <Progress value={progress} className="w-full" />
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
