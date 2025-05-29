'use client';

import React, { useState } from "react";
import { supabase } from "@/lib/supabase";
import { useRouter } from "next/navigation";

type LoginError = {
  message: string;
};

export default function LoginPage() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<LoginError | null>(null);
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const email = `${username}@local.com`;
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email,
        password: password,
      });

      if (signInError) throw signInError;

      const { data: { user } } = await supabase.auth.getUser();
      if (!user?.user_metadata?.nickname) {
        const { error: updateError } = await supabase.auth.updateUser({
          data: { nickname: username }
        });

        if (updateError) {
          console.error('Error updating user metadata:', updateError);
        }
      }

      router.push('/diary');
    } catch (error) {
      console.error('Error:', error);
      setError({ message: '登录失败，请检查神秘代码' });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-amber-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-lg shadow-lg p-8 w-full max-w-md">
        <h1 className="text-2xl font-bold text-amber-600 text-center mb-6">碎碎念</h1>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="username" className="block text-sm font-medium text-gray-700 mb-1">
              神秘代码1
            </label>
            <input
              type="text"
              id="username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="w-full p-2 border border-amber-200 rounded focus:outline-none focus:ring-2 focus:ring-amber-500 text-gray-800"
              placeholder="请输入神秘代码1"
              required
              disabled={loading}
            />
          </div>
          <div>
            <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-1">
              神秘代码2
            </label>
            <input
              type="password"
              id="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full p-2 border border-amber-200 rounded focus:outline-none focus:ring-2 focus:ring-amber-500 text-gray-800"
              placeholder="请输入神秘代码2"
              required
              disabled={loading}
            />
          </div>
          {error && (
            <div className="text-red-500 text-sm">
              {error.message}
            </div>
          )}
          <button
            type="submit"
            className="w-full bg-amber-500 text-white py-2 rounded hover:bg-amber-600 transition-colors disabled:opacity-50"
            disabled={loading}
          >
            {loading ? "登录中..." : "登录"}
          </button>
        </form>
      </div>
    </div>
  );
}
