"use client";

import { useState, useRef } from "react";
import { AudioRecorder } from "@/lib/audio-recorder";
import { supabase } from "@/lib/supabase";
import { updateStreak } from "@/lib/streak";

export function useAudioRecorder(userId: string | undefined, materialId: string | undefined, initialAudioPath: string | null) {
    const [isRecording, setIsRecording] = useState(false);
    const [isUploading, setIsUploading] = useState(false);
    const [audioPath, setAudioPath] = useState<string | null>(initialAudioPath);
    const [error, setError] = useState("");
    const [playbackUrl, setPlaybackUrl] = useState<string | null>(null);
    const [previewUrl, setPreviewUrl] = useState<string | null>(null);
    const [previewIsPlaying, setPreviewIsPlaying] = useState(false);

    const recorderRef = useRef<AudioRecorder | null>(null);
    const audioRef = useRef<HTMLAudioElement | null>(null);
    const blobRef = useRef<Blob | null>(null);

    const requestPermission = async (): Promise<boolean> => {
        setError("");
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            stream.getTracks().forEach(track => track.stop());
            return true;
        } catch (err: any) {
            if (err.name === "NotAllowedError") {
                setError("マイクへのアクセスが拒否されました。ブラウザの設定からマイクの許可を有効にしてください。");
            } else if (err.name === "NotFoundError") {
                setError("マイクが見つかりません。マイク付きのデバイスをご使用ください。");
            } else {
                setError("マイクの起動に失敗しました。ブラウザの設定を確認してください。");
            }
            return false;
        }
    };

    const startRecording = async () => {
        if (!userId || !materialId) return;
        setError("");
        setPreviewUrl(null);
        blobRef.current = null;
        try {
            const recorder = new AudioRecorder();
            await recorder.start();
            recorderRef.current = recorder;
            setIsRecording(true);
        } catch (err: any) {
            if (err.name === "NotAllowedError") {
                setError("マイクへのアクセスが拒否されました。ブラウザの設定からマイクの許可を有効にしてください。");
            } else if (err.name === "NotFoundError") {
                setError("マイクが見つかりません。マイク付きのデバイスをご使用ください。");
            } else {
                setError("マイクの起動に失敗しました。ブラウザの設定を確認してください。");
            }
        }
    };

    const stopRecording = async () => {
        if (!recorderRef.current) return;
        setIsRecording(false);

        try {
            const blob = await recorderRef.current.stop();
            blobRef.current = blob;
            const url = URL.createObjectURL(blob);
            setPreviewUrl(url);
        } catch (err) {
            setError("録音の停止に失敗しました");
            console.error(err);
        } finally {
            recorderRef.current = null;
        }
    };

    const saveRecording = async () => {
        if (!blobRef.current) {
            console.error("Save failed: No recording blob found");
            return;
        }
        if (!userId || !materialId) {
            console.error("Save failed: User or Material ID missing", { userId, materialId });
            return;
        }

        setIsUploading(true);
        setError("");

        try {
            const filePath = `${userId}/${materialId}.webm`;
            console.log("Attempting to upload recording to:", filePath);

            // Upload to Supabase Storage (upsert)
            const { error: uploadError } = await supabase.storage
                .from("practice-recordings")
                .upload(filePath, blobRef.current, { upsert: true, contentType: "audio/webm" });

            if (uploadError) {
                console.error("Storage upload error:", uploadError);
                throw new Error(`ストレージへの保存に失敗しました: ${uploadError.message}`);
            }

            // Save/update recording record
            const { data: existing, error: fetchError } = await supabase
                .from("practice_recordings")
                .select("id")
                .eq("user_id", userId)
                .eq("material_id", materialId)
                .maybeSingle(); // Use maybeSingle to avoid error on 0 rows

            if (fetchError) {
                console.error("DB Fetch error:", fetchError);
                throw new Error("データの確認に失敗しました");
            }

            let dbError;
            if (existing) {
                const { error } = await supabase
                    .from("practice_recordings")
                    .update({ audio_path: filePath, created_at: new Date().toISOString() })
                    .eq("id", existing.id);
                dbError = error;
            } else {
                const { error } = await supabase.from("practice_recordings").insert({
                    user_id: userId,
                    material_id: materialId,
                    audio_path: filePath,
                });
                dbError = error;
            }

            if (dbError) {
                console.error("DB Save error:", dbError);
                throw new Error(`データベースの保存に失敗しました: ${dbError.message}`);
            }

            console.log("Recording saved successfully");
            updateStreak(userId).catch(console.error);
            setAudioPath(filePath);
            setPlaybackUrl(null);
            setPreviewUrl(null);
            blobRef.current = null;
        } catch (err: any) {
            setError(err.message || "録音の保存に失敗しました");
            console.error(err);
        } finally {
            setIsUploading(false);
        }
    };

    const togglePreviewPlayback = () => {
        if (!previewUrl) return;

        if (!audioRef.current || audioRef.current.src !== previewUrl) {
            const audio = new Audio(previewUrl);
            audioRef.current = audio;
            audio.onplay = () => setPreviewIsPlaying(true);
            audio.onpause = () => setPreviewIsPlaying(false);
            audio.onended = () => {
                setPreviewIsPlaying(false);
                audio.currentTime = 0;
            };
        }

        if (previewIsPlaying) {
            audioRef.current.pause();
        } else {
            audioRef.current.play();
        }
    };

    const discardRecording = () => {
        if (audioRef.current) {
            audioRef.current.pause();
            audioRef.current = null;
        }
        setPreviewUrl(null);
        setPreviewIsPlaying(false);
        blobRef.current = null;
        setError("");
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
                if (audioRef.current) audioRef.current.pause();
                audioRef.current = audio;
                audio.play();
            }
        } else {
            if (audioRef.current) {
                audioRef.current.currentTime = 0;
                audioRef.current.play();
            } else {
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
        requestPermission,
        startRecording,
        stopRecording,
        saveRecording,
        discardRecording,
        previewUrl,
        previewIsPlaying,
        togglePreviewPlayback,
        playRecording,
        deleteRecording
    };
}
