"use client";

import { useState, useRef } from "react";
import { AudioRecorder } from "@/lib/audio-recorder";
import { supabase } from "@/lib/supabase";

export function useAudioRecorder(userId: string | undefined, materialId: string | undefined, initialAudioPath: string | null) {
    const [isRecording, setIsRecording] = useState(false);
    const [isUploading, setIsUploading] = useState(false);
    const [audioPath, setAudioPath] = useState<string | null>(initialAudioPath);
    const [playbackUrl, setPlaybackUrl] = useState<string | null>(null);
    const [error, setError] = useState("");

    const recorderRef = useRef<AudioRecorder | null>(null);
    const audioRef = useRef<HTMLAudioElement | null>(null);

    const startRecording = async () => {
        if (!userId || !materialId) return;
        setError("");
        try {
            const recorder = new AudioRecorder();
            await recorder.start();
            recorderRef.current = recorder;
            setIsRecording(true);
        } catch {
            setError("マイクへのアクセスが拒否されました");
        }
    };

    const stopRecording = async () => {
        if (!recorderRef.current || !userId || !materialId) return;
        setIsRecording(false);
        setIsUploading(true);

        try {
            const blob = await recorderRef.current.stop();
            const filePath = `${userId}/${materialId}.webm`;

            // Upload to Supabase Storage (upsert)
            const { error: uploadError } = await supabase.storage
                .from("practice-recordings")
                .upload(filePath, blob, { upsert: true, contentType: "audio/webm" });

            if (uploadError) throw uploadError;

            // Save/update recording record
            const { data: existing } = await supabase
                .from("practice_recordings")
                .select("id")
                .eq("user_id", userId)
                .eq("material_id", materialId)
                .single();

            if (existing) {
                await supabase
                    .from("practice_recordings")
                    .update({ audio_path: filePath, created_at: new Date().toISOString() })
                    .eq("id", existing.id);
            } else {
                await supabase.from("practice_recordings").insert({
                    user_id: userId,
                    material_id: materialId,
                    audio_path: filePath,
                });
            }

            setAudioPath(filePath);
            setPlaybackUrl(null); // Reset so it fetches fresh URL
        } catch (err) {
            setError("録音の保存に失敗しました");
            console.error(err);
        } finally {
            setIsUploading(false);
            recorderRef.current = null;
        }
    };

    const playRecording = async () => {
        if (!audioPath) return;

        if (!playbackUrl) {
            const { data } = await supabase.storage
                .from("practice-recordings")
                .createSignedUrl(audioPath, 300);

            if (data?.signedUrl) {
                setPlaybackUrl(data.signedUrl);
                const audio = new Audio(data.signedUrl);
                // Clean up previous audio if playing?
                if (audioRef.current) {
                    audioRef.current.pause();
                }
                audioRef.current = audio;
                audio.play();

                // Reset state when done?
                audio.onended = () => {
                    // Optional: state change
                };
            }
        } else {
            if (audioRef.current) {
                audioRef.current.currentTime = 0;
                audioRef.current.play();
            } else {
                // Re-create if ref is lost but url exists
                const audio = new Audio(playbackUrl);
                audioRef.current = audio;
                audio.play();
            }
        }
    };

    const deleteRecording = async () => {
        if (!audioPath || !userId || !materialId) return;
        if (!confirm("録音を削除しますか？")) return;

        await supabase.storage
            .from("practice-recordings")
            .remove([audioPath]);

        await supabase
            .from("practice_recordings")
            .delete()
            .eq("user_id", userId)
            .eq("material_id", materialId);

        setAudioPath(null);
        setPlaybackUrl(null);
        if (audioRef.current) {
            audioRef.current.pause();
            audioRef.current = null;
        }
    };

    return {
        isRecording,
        isUploading,
        audioPath,
        setAudioPath,
        error,
        startRecording,
        stopRecording,
        playRecording,
        deleteRecording
    };
}
