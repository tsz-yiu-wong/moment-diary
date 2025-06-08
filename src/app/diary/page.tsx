'use client';

import React, { useState, useRef, useEffect, useCallback } from "react";
import { supabase } from "@/lib/supabase";
import { useRouter } from "next/navigation";
import Image from "next/image";

type Diary = {
  id: number;
  content: string;
  date: string;
  beijing_time: string;
  image_urls: string[] | null;
  created_at: string;
  user: {
    nickname: string;
  };
  isOwner: boolean;
  is_hidden: boolean;
};

export default function DiaryPage() {
  const [diaries, setDiaries] = useState<Diary[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [showNicknameForm, setShowNicknameForm] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [diaryToDelete, setDiaryToDelete] = useState<Diary | null>(null);
  const [content, setContent] = useState("");
  const [imageUrls, setImageUrls] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [userNickname, setUserNickname] = useState("");
  const [newNickname, setNewNickname] = useState("");
  const [timeUntilMeeting, setTimeUntilMeeting] = useState({ days: 0, hours: 0 });
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [currentTime, setCurrentTime] = useState({ beijing: "", london: "" });
  const [showImagePreview, setShowImagePreview] = useState(false);
  const [previewImages, setPreviewImages] = useState<string[]>([]);
  const [currentPreviewIndex, setCurrentPreviewIndex] = useState(0);
  const [touchStart, setTouchStart] = useState<number | null>(null);
  const [mouseStart, setMouseStart] = useState<number | null>(null);
  const router = useRouter();

  const checkUser = useCallback(async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      router.push('/');
      return;
    }
    
    // 获取用户信息
    const { data: { user } } = await supabase.auth.getUser();
    if (user?.user_metadata?.nickname) {
      setUserNickname(user.user_metadata.nickname);
    } else {
      // 如果没有昵称，使用邮箱前缀作为昵称
      const email = user?.email || '';
      const nickname = email.split('@')[0];
      setUserNickname(nickname);
      
      // 更新用户元数据
      const { error: updateError } = await supabase.auth.updateUser({
        data: { nickname }
      });

      if (updateError) {
        console.error('Error updating user metadata:', updateError);
      }
    }
  }, [router]);

  const fetchDiaries = useCallback(async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        router.push('/');
        return;
      }

      const { data: diariesData, error: diariesError } = await supabase
        .from('diaries')
        .select('*')
        .eq('is_hidden', false)
        .order('created_at', { ascending: false });

      if (diariesError) {
        console.error('Supabase error fetching diaries:', diariesError.message);
        throw diariesError;
      }

      const userIds = [...new Set(diariesData?.map(diary => diary.user_id) || [])];
      const { data: usersData, error: usersError } = await supabase
        .from('users')
        .select('id, nickname')
        .in('id', userIds);

      if (usersError) {
        console.error('Error getting users data:', usersError.message);
        throw usersError;
      }

      const userMap = new Map(
        usersData?.map(user => [user.id, user.nickname]) || []
      );

      const diariesWithUser = diariesData?.map(diary => ({
        ...diary,
        user: {
          nickname: userMap.get(diary.user_id) || '未知用户'
        },
        isOwner: diary.user_id === session.user.id
      })) || [];

      setDiaries(diariesWithUser);
    } catch (error) {
      console.error('Error fetching diaries:', error);
      if (error instanceof Error) {
        console.error('Error details:', error.message);
      }
    }
  }, [router]);

  useEffect(() => {
    checkUser();
    fetchDiaries();
    
    const updateTime = () => {
      const now = new Date();
      const beijingTime = now.toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Shanghai" });
      const londonTime = now.toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/London" });
      setCurrentTime({ beijing: beijingTime, london: londonTime });

      // 计算距离见面的时间（精确到小时）
      const meetingDate = new Date('2025-06-11T12:00:00+08:00');
      const diffTime = meetingDate.getTime() - now.getTime();
      const days = Math.floor(diffTime / (1000 * 60 * 60 * 24));
      const hours = Math.floor((diffTime % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
      setTimeUntilMeeting({ days, hours });
    };

    // 立即执行一次
    updateTime();

    // 计算距离下一个整分钟的毫秒数
    const now = new Date();
    const delay = (60 - now.getSeconds()) * 1000 - now.getMilliseconds();

    // 设置定时器，在下一个整分钟开始时执行
    const timeoutId = setTimeout(() => {
      updateTime();
      // 之后每分钟执行一次
      const intervalId = setInterval(updateTime, 60000);
      return () => clearInterval(intervalId);
    }, delay);

    return () => clearTimeout(timeoutId);
  }, [checkUser, fetchDiaries]);

  const handleUpdateNickname = async () => {
    if (!newNickname.trim()) return;
    
    setLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        throw new Error('No active session');
      }

      // 更新用户元数据中的昵称
      const { error: updateError } = await supabase.auth.updateUser({
        data: { nickname: newNickname }
      });

      if (updateError) throw updateError;

      // 更新用户表中的昵称
      const { error: userUpdateError } = await supabase
        .from('users')
        .update({ nickname: newNickname })
        .eq('id', session.user.id);

      if (userUpdateError) throw userUpdateError;

      setUserNickname(newNickname);
      setShowNicknameForm(false);
      await fetchDiaries(); // 重新获取日记列表以更新显示
    } catch (error) {
      console.error('Error updating nickname:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    setLoading(true);
    try {
      const newImageUrls: string[] = [];
      
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const fileExt = file.name.split('.').pop();
        const fileName = `${Math.random()}.${fileExt}`;
        
        const { error } = await supabase.storage
          .from('diary-images')
          .upload(fileName, file);

        if (error) throw error;

        const { data: { publicUrl } } = supabase.storage
          .from('diary-images')
          .getPublicUrl(fileName);

        newImageUrls.push(publicUrl);
      }

      setImageUrls(prevUrls => [...prevUrls, ...newImageUrls]);
    } catch (error) {
      console.error('Error uploading images:', error);
    } finally {
      setLoading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  };

  const removeImage = (index: number) => {
    setImageUrls(imageUrls.filter((_, i) => i !== index));
  };

  const openImagePreview = (images: string[], startIndex: number) => {
    setPreviewImages(images);
    setCurrentPreviewIndex(startIndex);
    setShowImagePreview(true);
  };

  const calculateLondonTime = (beijingTime: string, date: string) => {
    if (!beijingTime || !date) return '';
    // 将日记的日期（如 '2023/10/27'）和北京时间（如 '15:30'）
    // 合成一个带时区信息的 ISO 格式字符串。
    // '2023/10/27' -> '2023-10-27'
    // '2023-10-27' + 'T' + '15:30' + ':00+08:00' -> '2023-10-27T15:30:00+08:00'
    // 这样做可以确保 new Date() 正确地将这个时间解析为北京时间，无论浏览器在哪个时区。
    const formattedDate = date.replace(/\//g, '-');
    const isoString = `${formattedDate}T${beijingTime}:00+08:00`;
    
    const beijingDate = new Date(isoString);

    // 如果日期无效，返回空字符串
    if (isNaN(beijingDate.getTime())) {
      return '';
    }

    // toLocaleTimeString 可以根据指定的时区（'Europe/London'）和日期，
    // 自动判断是使用标准时间（GMT）还是夏令时（BST）进行转换和格式化。
    return beijingDate.toLocaleTimeString("zh-CN", {
      hour: "2-digit",
      minute: "2-digit",
      timeZone: "Europe/London"
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        router.push('/');
        return;
      }

      const now = new Date();
      const beijingTime = now.toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Shanghai" });

      const { error } = await supabase
        .from('diaries')
        .insert([
          {
            content,
            date: now.toLocaleDateString("zh-CN", { year: "numeric", month: "2-digit", day: "2-digit" }),
            beijing_time: beijingTime,
            image_urls: imageUrls.length > 0 ? imageUrls : null,
            user_id: session.user.id
          }
        ]);

      if (error) throw error;

      await fetchDiaries();
      setContent("");
      setImageUrls([]);
      setShowForm(false);
    } catch (error) {
      console.error('Error creating diary:', error);
    } finally {
      setLoading(false);
    }
  };

  const openDeleteConfirm = (diary: Diary) => {
    setDiaryToDelete(diary);
    setShowDeleteConfirm(true);
  };

  const confirmDelete = async () => {
    if (!diaryToDelete) return;
    setLoading(true);
    try {
      // 先获取当前用户信息
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        throw new Error('No active session');
      }

      console.log('Current user:', session.user.id);
      console.log('Diary to delete:', diaryToDelete);

      // 只更新 is_hidden 字段
      const { data, error } = await supabase
        .from('diaries')
        .update({ is_hidden: true })
        .eq('id', diaryToDelete.id)
        .eq('user_id', session.user.id) // 添加用户ID检查
        .select();

      if (error) {
        console.error('Error hiding diary:', error.message);
        console.error('Error details:', error);
        throw error;
      }

      console.log('Update successful:', data);

      await fetchDiaries();
      setShowDeleteConfirm(false);
      setDiaryToDelete(null);
    } catch (error) {
      console.error('Error in confirmDelete:', error);
      if (error instanceof Error) {
        console.error('Error details:', error.message);
      }
    } finally {
      setLoading(false);
    }
  };

  const handleTouchStart = (e: React.TouchEvent) => {
    setTouchStart(e.touches[0].clientX);
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (!touchStart) return;
    
    const currentTouch = e.touches[0].clientX;
    const diff = touchStart - currentTouch;

    // 如果滑动距离超过50像素才触发切换
    if (Math.abs(diff) > 50) {
      if (diff > 0 && currentPreviewIndex < previewImages.length - 1) {
        setCurrentPreviewIndex(i => i + 1);
      } else if (diff < 0 && currentPreviewIndex > 0) {
        setCurrentPreviewIndex(i => i - 1);
      }
      setTouchStart(null);
    }
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    setMouseStart(e.clientX);
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!mouseStart) return;
    
    const diff = mouseStart - e.clientX;

    // 如果拖动距离超过50像素才触发切换
    if (Math.abs(diff) > 50) {
      if (diff > 0 && currentPreviewIndex < previewImages.length - 1) {
        setCurrentPreviewIndex(i => i + 1);
      } else if (diff < 0 && currentPreviewIndex > 0) {
        setCurrentPreviewIndex(i => i - 1);
      }
      setMouseStart(null);
    }
  };

  const handleMouseUp = () => {
    setMouseStart(null);
  };

  const handlePrevImage = () => {
    setCurrentPreviewIndex(i => i - 1);
  };

  const handleNextImage = () => {
    setCurrentPreviewIndex(i => i + 1);
  };

  return (
    <div className="min-h-screen bg-amber-50 p-4">
      <div className="flex justify-between items-center mb-2">
        <div className="w-24"></div>
        <h1 className="text-2xl font-bold text-amber-600 text-center">碎碎念</h1>
        <button
          onClick={() => {
            setNewNickname("");
            setShowNicknameForm(true);
          }}
          className="text-amber-600 font-medium hover:text-amber-700 transition-colors w-24 text-right"
        >
          {userNickname || '设置昵称'}
        </button>
      </div>
      <div className="flex justify-between text-sm text-amber-700 mb-2">
        <span>北京时间: {currentTime.beijing}</span>
        <span>伦敦时间: {currentTime.london}</span>
      </div>
      <div className="bg-gradient-to-r from-amber-200 via-amber-100 to-amber-200 rounded-lg shadow p-2 mb-4 border border-amber-200">
        <div className="text-center">
          <p className="text-amber-600">
            距离见面还有 <span className="text-3xl font-bold text-amber-500 mx-1">{timeUntilMeeting.days}</span>天 <span className="text-3xl font-bold text-amber-500 mx-1">{timeUntilMeeting.hours}</span>小时
          </p>
        </div>
      </div>
      <div className="space-y-4">
        {diaries.map(diary => (
          <div key={diary.id} className="bg-white rounded-lg shadow p-4 border border-amber-100">
            <div className="flex items-center gap-2 mb-2">
              <span className="text-amber-600 font-medium">
                {diary.user?.nickname || '未知用户'} 
              </span>
            </div>
            <p className="text-gray-600">{diary.content}</p>
            {diary.image_urls && diary.image_urls.length > 0 && (
              <div className="grid grid-cols-3 gap-2 mt-2">
                {diary.image_urls.slice(0, 3).map((url, index) => (
                  <div key={index} className="relative aspect-square">
                    <Image
                      src={url}
                      alt={`碎碎念配图 ${index + 1}`}
                      className="w-full h-full object-cover rounded"
                      onClick={() => openImagePreview(diary.image_urls || [], index)}
                      width={300}
                      height={300}
                      unoptimized
                    />
                    {/* 只在编辑模式下显示删除按钮 */}
                    {diary.isOwner && showForm && (
                      <button
                        type="button"
                        className="absolute top-1 right-1 w-6 h-6 bg-red-500 text-white rounded-full flex items-center justify-center text-sm"
                        onClick={() => removeImage(index)}
                      >
                        ×
                      </button>
                    )}
                    {/* 如果是第三张图片且还有更多图片，显示蒙版 */}
                    {index === 2 && diary.image_urls && diary.image_urls.length > 3 && (
                      <div 
                        className="absolute inset-0 bg-black/70 rounded flex items-center justify-center text-white text-lg font-medium cursor-pointer"
                        onClick={() => openImagePreview(diary.image_urls || [], 2)}
                      >
                        +{diary.image_urls.length - 3}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
            <div className="flex justify-between items-center mt-2">
              <p className="text-sm text-amber-500">
                {diary.date}，{diary.beijing_time}(CN)，{calculateLondonTime(diary.beijing_time, diary.date)}(UK)
              </p>
              {diary.isOwner && (
                <button
                  onClick={() => openDeleteConfirm(diary)}
                  className="text-red-500 hover:text-red-600 text-sm"
                  disabled={loading}
                >
                  删除
                </button>
              )}
            </div>
          </div>
        ))}
      </div>
      <button
        className="fixed bottom-6 right-6 w-12 h-12 bg-amber-500 text-white rounded-full flex items-center justify-center shadow-lg hover:bg-amber-600 transition-colors"
        aria-label="新增碎碎念"
        onClick={() => setShowForm(true)}
      >
        +
      </button>
      {showForm && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-40">
          <form 
            onSubmit={handleSubmit} 
            className="bg-white rounded-lg p-6 w-full max-w-md max-h-[90vh] overflow-y-auto flex flex-col"
          >
            <h2 className="text-xl font-bold mb-4 text-amber-600 sticky top-0 bg-white py-2 z-10">留下碎碎念</h2>
            <div className="flex-grow overflow-y-auto pr-2">
              <textarea
                className="w-full p-2 border border-amber-200 rounded mb-4 text-gray-800"
                placeholder="在干嘛，么么么"
                value={content}
                onChange={e => setContent(e.target.value)}
                rows={4}
                disabled={loading}
              />
              <input
                type="file"
                accept="image/*"
                multiple
                className="hidden"
                ref={fileInputRef}
                onChange={handleFileChange}
                disabled={loading}
              />
              <div className="grid grid-cols-3 gap-2 mb-4">
                {imageUrls.map((url, index) => (
                  <div key={index} className="relative aspect-square">
                    <Image
                      src={url}
                      alt={`预览图片 ${index + 1}`}
                      className="w-full h-full object-cover rounded"
                      onClick={() => openImagePreview(imageUrls, index)}
                      width={300}
                      height={300}
                      unoptimized
                    />
                    <button
                      type="button"
                      className="absolute top-1 right-1 w-6 h-6 bg-red-500 text-white rounded-full flex items-center justify-center text-sm"
                      onClick={() => removeImage(index)}
                    >
                      ×
                    </button>
                  </div>
                ))}
                <button
                  type="button"
                  className="aspect-square border-2 border-dashed border-amber-200 rounded flex items-center justify-center text-amber-500 hover:border-amber-300"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={loading}
                >
                  {loading ? "上传中..." : "+"}
                </button>
              </div>
            </div>
            <div className="mt-auto pt-4 border-t border-gray-200 sticky bottom-0 bg-white py-2 z-10">
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  className="px-4 py-2 bg-gray-200 text-gray-800 rounded hover:bg-gray-300"
                  onClick={() => setShowForm(false)}
                  disabled={loading}
                >
                  取消
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-amber-500 text-white rounded disabled:opacity-50"
                  disabled={loading}
                >
                  {loading ? "上传照片中..." : "发布"}
                </button>
              </div>
            </div>
          </form>
        </div>
      )}
      {showNicknameForm && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-lg p-4 w-full max-w-xs">
            <h2 className="text-xl font-bold mb-4 text-amber-600">修改昵称</h2>
            <input
              type="text"
              className="w-full p-2 border border-amber-200 rounded mb-4 text-gray-800"
              placeholder={userNickname || "请输入新昵称"}
              value={newNickname}
              onChange={e => setNewNickname(e.target.value)}
              disabled={loading}
            />
            <div className="flex justify-end gap-2">
              <button
                type="button"
                className="px-4 py-2 bg-gray-200 text-gray-800 rounded hover:bg-gray-300"
                onClick={() => setShowNicknameForm(false)}
                disabled={loading}
              >
                取消
              </button>
              <button
                type="button"
                className="px-4 py-2 bg-amber-500 text-white rounded disabled:opacity-50"
                onClick={handleUpdateNickname}
                disabled={loading}
              >
                {loading ? "保存中..." : "保存"}
              </button>
            </div>
          </div>
        </div>
      )}
      {showDeleteConfirm && diaryToDelete && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-lg p-6 w-full max-w-sm shadow-xl">
            <h2 className="text-xl font-bold mb-4 text-amber-600">确认删除</h2>
            <p className="text-gray-700 mb-6">
              确定要删除这篇碎碎念吗？
            </p>
            <div className="flex justify-end gap-3">
              <button
                type="button"
                className="px-4 py-2 bg-gray-200 text-gray-800 rounded hover:bg-gray-300 transition-colors"
                onClick={() => {
                  setShowDeleteConfirm(false);
                  setDiaryToDelete(null);
                }}
                disabled={loading}
              >
                取消
              </button>
              <button
                type="button"
                className="px-4 py-2 bg-red-500 text-white rounded hover:bg-red-600 transition-colors disabled:opacity-50"
                onClick={confirmDelete}
                disabled={loading}
              >
                {loading ? "删除中..." : "确认删除"}
              </button>
            </div>
          </div>
        </div>
      )}
      {showImagePreview && (
        <div 
          className="fixed inset-0 bg-black bg-opacity-90 flex items-center justify-center z-50"
          onClick={() => setShowImagePreview(false)}
        >
          <div className="relative w-full h-full flex items-center justify-center">
            <button
              className="absolute top-4 right-4 text-white text-2xl z-50 hover:text-gray-300 transition-colors"
              onClick={() => setShowImagePreview(false)}
            >
              ×
            </button>
            <div 
              className="relative w-full h-full flex items-center justify-center cursor-grab active:cursor-grabbing overflow-hidden"
              onTouchStart={handleTouchStart}
              onTouchMove={handleTouchMove}
              onMouseDown={handleMouseDown}
              onMouseMove={handleMouseMove}
              onMouseUp={handleMouseUp}
              onMouseLeave={handleMouseUp}
            >
              <div className="relative w-full h-full">
                {previewImages.map((url, index) => (
                  <Image
                    key={url}
                    src={url}
                    alt={`预览图片 ${index + 1}`}
                    className={`absolute inset-0 w-full h-full object-contain transition-transform duration-300 ease-in-out select-none ${
                      index === currentPreviewIndex
                        ? 'translate-x-0'
                        : index < currentPreviewIndex
                        ? '-translate-x-full'
                        : 'translate-x-full'
                    }`}
                    width={1200}
                    height={1200}
                    unoptimized
                    draggable="false"
                  />
                ))}
              </div>
              <div className="absolute bottom-4 left-1/2 transform -translate-x-1/2 text-white">
                {currentPreviewIndex + 1} / {previewImages.length}
              </div>
            </div>
            {currentPreviewIndex > 0 && (
              <button
                className="absolute left-4 top-1/2 transform -translate-y-1/2 text-white text-4xl hover:text-gray-300 transition-colors"
                onClick={(e) => {
                  e.stopPropagation();
                  handlePrevImage();
                }}
              >
                ‹
              </button>
            )}
            {currentPreviewIndex < previewImages.length - 1 && (
              <button
                className="absolute right-4 top-1/2 transform -translate-y-1/2 text-white text-4xl hover:text-gray-300 transition-colors"
                onClick={(e) => {
                  e.stopPropagation();
                  handleNextImage();
                }}
              >
                ›
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
} 