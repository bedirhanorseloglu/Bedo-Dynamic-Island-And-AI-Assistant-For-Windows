"""
JARVIS — Gemini Live araç (tool) tanımları
Windows masaüstü çekirdeği (main.py) kullanır.
"""

TOOL_DECLARATIONS = [
    {
        "name": "sleep_assistant",
        "description": "Kullanıcı konuşmayı bitirmek istediğinde ('kapan', 'kapanabilirsin', 'işin bitti', 'uyku moduna geç', 'görüşürüz') Bedo'yu uyku moduna alır ve adayı kapatır.",
        "parameters": {
            "type": "OBJECT",
            "properties": {}
        }
    },
    {
        "name": "open_app",
        "description": "Windows'ta herhangi bir uygulamayı, klasörü veya dosyayı açar. Spotify, Chrome, Comet, Terminal, Dosya Gezgini, Masaüstü, İndirilenler, Belgeler veya belirli bir klasör yolu vb.",
        "parameters": {
            "type": "OBJECT",
            "properties": {
                "app_name": {
                    "type": "STRING",
                    "description": "Uygulama, klasör veya dosya adı/yolu (örn. 'Spotify', 'Comet', 'Masaüstü', 'İndirilenler', 'JARVIS')"
                }
            },
            "required": ["app_name"]
        }
    },
    {
        "name": "sys_info",
        "description": "Sistem bilgisi alır: pil durumu, CPU, RAM, disk, saat, tarih, ağ bağlantısı.",
        "parameters": {
            "type": "OBJECT",
            "properties": {
                "query": {
                    "type": "STRING",
                    "description": "battery | cpu | ram | disk | time | date | network | all"
                }
            },
            "required": ["query"]
        }
    },
    {
        "name": "get_weather",
        "description": (
            "Anlik hava durumunu ozetler. Varsayilan konum Istanbul'dur. "
            "Kullanici hava durumunu, sicakligi veya yagmur durumunu sordugunda kullan."
        ),
        "parameters": {
            "type": "OBJECT",
            "properties": {
                "location": {
                    "type": "STRING",
                    "description": "Sehir veya konum. Bos birakilirsa Istanbul kullanilir."
                }
            }
        }
    },
    {
        "name": "get_calendar_events",
        "description": (
            "Takvim (Google Calendar) etkinliklerini okur. "
            "Bugun, yarin, siradaki etkinlik veya yaklasan ajandayi ozetler. "
            "Kullanici toplanti, takvim, ajanda, etkinlik veya gunluk programini sordugunda kullan."
        ),
        "parameters": {
            "type": "OBJECT",
            "properties": {
                "query": {
                    "type": "STRING",
                    "description": (
                        "today | tomorrow | next | agenda | week veya dogal dilde "
                        "'onumuzdeki 30 gun', '2 hafta', 'bu ay', 'gelecek ay'"
                    )
                },
                "limit": {
                    "type": "NUMBER",
                    "description": "Maksimum etkinlik sayisi"
                }
            },
            "required": ["query"]
        }
    },
    {
        "name": "add_calendar_event",
        "description": (
            "Takvim (Google Calendar) servisine yeni etkinlik ekler. "
            "Kullanici toplanti, randevu, takvime ekleme veya etkinlik olusturma isterse kullan. "
            "Baslangic tarihini gercek tarih/saat olarak ver; bitis verilmezse varsayilan sure kullanilir."
        ),
        "parameters": {
            "type": "OBJECT",
            "properties": {
                "title": {
                    "type": "STRING",
                    "description": "Etkinlik basligi. Ornek: 'Disci Randevusu'"
                },
                "start_iso": {
                    "type": "STRING",
                    "description": "Baslangic tarih/saat. ISO veya yyyy-MM-dd HH:mm formatinda."
                },
                "end_iso": {
                    "type": "STRING",
                    "description": "Bitis tarih/saat. Opsiyonel."
                },
                "location": {
                    "type": "STRING",
                    "description": "Etkinlik konumu. Opsiyonel."
                },
                "notes": {
                    "type": "STRING",
                    "description": "Etkinlik notlari. Opsiyonel."
                },
                "calendar_name": {
                    "type": "STRING",
                    "description": "Eklenecek takvim adi. Opsiyonel."
                },
                "all_day": {
                    "type": "BOOLEAN",
                    "description": "true ise tum gun etkinligi olusturur."
                }
            },
            "required": ["title", "start_iso"]
        }
    },
    {
        "name": "delete_calendar_event",
        "description": (
            "Takvim (Google Calendar) servisinden etkinlik siler. "
            "Kullanici bir toplantiyi, randevuyu veya takvim kaydini silmek istediginde kullan. "
            "Ayni ada birden fazla etkinlik varsa dogru kaydi bulmak icin baslangic tarihini gercek tarih/saat olarak ver."
        ),
        "parameters": {
            "type": "OBJECT",
            "properties": {
                "title": {
                    "type": "STRING",
                    "description": "Silinecek etkinlik basligi. Ornek: 'Disci Randevusu'"
                },
                "start_iso": {
                    "type": "STRING",
                    "description": "Opsiyonel tarih/saat. Ayni isimli birden fazla etkinligi ayirt etmek icin kullan."
                },
                "calendar_name": {
                    "type": "STRING",
                    "description": "Opsiyonel takvim adi"
                },
                "delete_all_matches": {
                    "type": "BOOLEAN",
                    "description": "true ise eslesen tum etkinlikleri siler"
                }
            },
            "required": ["title"]
        }
    },
    {
        "name": "get_reminders",
        "description": (
            "Hatırlatıcılar (Microsoft To-Do) listesini okur. "
            "Bugunku, yaklasan, geciken veya tum acik animsaticilari ozetler. "
            "Kullanici hatirlatma, animsatici, reminder veya yapilacaklar listesini sordugunda kullan."
        ),
        "parameters": {
            "type": "OBJECT",
            "properties": {
                "query": {
                    "type": "STRING",
                    "description": "today | upcoming | overdue | all | next"
                },
                "limit": {
                    "type": "NUMBER",
                    "description": "Maksimum animsatici sayisi"
                },
                "list_name": {
                    "type": "STRING",
                    "description": "Istenirse belirli bir animsatici listesi adi"
                }
            },
            "required": ["query"]
        }
    },
    {
        "name": "add_reminder",
        "description": (
            "Hatırlatıcılar (Microsoft To-Do) uygulamasina yeni bir animsatici ekler. "
            "Kullanici 'hatirlat', 'animsatici ekle', 'reminder kur' dediginde kullan. "
            "Goreli zaman ifadelerini bugunku tarih baglamina gore due_iso alanina ISO formatinda cevir."
        ),
        "parameters": {
            "type": "OBJECT",
            "properties": {
                "title": {
                    "type": "STRING",
                    "description": "Animsatici basligi"
                },
                "due_iso": {
                    "type": "STRING",
                    "description": "Opsiyonel tarih/saat. Ornek: 2026-04-13T09:00 veya tum gun icin 2026-04-13"
                },
                "notes": {
                    "type": "STRING",
                    "description": "Opsiyonel not"
                },
                "list_name": {
                    "type": "STRING",
                    "description": "Opsiyonel animsatici listesi"
                },
                "priority": {
                    "type": "STRING",
                    "description": "low | medium | high"
                },
                "all_day": {
                    "type": "BOOLEAN",
                    "description": "Tum gun animsatici ise true"
                }
            },
            "required": ["title"]
        }
    },
    {
        "name": "browser_control",
        "description": "Tarayıcıda URL açar, Google'da arama yapar veya YouTube'da ilk sonucu doğrudan oynatır.",
        "parameters": {
            "type": "OBJECT",
            "properties": {
                "action": {"type": "STRING", "description": "open_url | search | play_youtube"},
                "url":    {"type": "STRING", "description": "Açılacak URL (open_url için)"},
                "query":  {"type": "STRING", "description": "Arama sorgusu (search veya play_youtube için)"}
            },
            "required": ["action"]
        }
    },
    {
        "name": "shell_run",
        "description": "Windows komut satırı (cmd.exe) komutu çalıştırır. Dosya işlemleri, sistem yönetimi.",
        "parameters": {
            "type": "OBJECT",
            "properties": {
                "command": {
                    "type": "STRING",
                    "description": "Çalıştırılacak komut"
                }
            },
            "required": ["command"]
        }
    },
    {
        "name": "toggle_webcam",
        "description": (
            "Gerçek zamanlı webcam akışını başlatır veya durdurur. "
            "Akış aktifken model sürekli kamera görüntüsü alır — 'bak', 'gör', 'göster', "
            "'kameraya bak', 'önümdekileri anlat', 'ne görüyorsun' gibi komutlarda 'start' kullan. "
            "'kamerayı kapat', 'artık bakma' gibi durumlarda 'stop' kullan."
        ),
        "parameters": {
            "type": "OBJECT",
            "properties": {
                "action": {
                    "type": "STRING",
                    "description": "start — akışı başlat  |  stop — akışı durdur"
                }
            },
            "required": ["action"]
        }
    },
    {
        "name": "play_media",
        "description": (
            "YouTube veya Spotify'da şarkı, müzik veya video açar. "
            "Kullanıcı belirli bir platform söylerse onu kullan. "
            "Belirtmezse uygun olanı dene. "
            "Kullanıcı 'çal', 'oynat', 'aç' diyorsa autoplay=true kullan."
        ),
        "parameters": {
            "type": "OBJECT",
            "properties": {
                "query": {
                    "type": "STRING",
                    "description": "Şarkı, sanatçı, albüm veya video arama ifadesi"
                },
                "provider": {
                    "type": "STRING",
                    "description": "auto | youtube | spotify"
                },
                "autoplay": {
                    "type": "BOOLEAN",
                    "description": "true ise mümkünse doğrudan oynatır"
                }
            },
            "required": ["query"]
        }
    },
    {
        "name": "get_youtube_channel_report",
        "description": (
            "YouTube kanalinin public istatistiklerini ve son videolarin performansini raporlar. "
            "Kullanici kanal istatistiklerini, abone sayisini, son videolarini, buyume hizini "
            "veya YouTube analizini sordugunda kullan. Bu arac Studio yerine public YouTube Data API verisini kullanir."
        ),
        "parameters": {
            "type": "OBJECT",
            "properties": {
                "query": {
                    "type": "STRING",
                    "description": (
                        "Dogal dilde analiz istegi. Ornek: "
                        "'YouTube istatistiklerim nasil', 'son videolarimi analiz et', "
                        "'kanal buyumemi ozetle'"
                    )
                },
                "handle": {
                    "type": "STRING",
                    "description": (
                        "Opsiyonel kanal handle'i, kanal linki veya kanal ID'si. "
                        "Bos birakilirsa ayarlardaki youtube_channel_handle kullanilir."
                    )
                },
                "video_limit": {
                    "type": "NUMBER",
                    "description": "Analize dahil edilecek son video sayisi. Varsayilan 6."
                }
            },
            "required": ["query"]
        }
    },
    {
        "name": "analyze_screen",
        "description": (
            "Aktif pencerenin ekran goruntusunu alip Gemini vision ile analiz eder. "
            "Kullanici ekranda ne oldugunu, bir hatayi, gorunen metni, butonlari veya pencere icerigini sordugunda kullan. "
            "Bu surum yalnizca aktif pencereyi destekler."
        ),
        "parameters": {
            "type": "OBJECT",
            "properties": {
                "query": {
                    "type": "STRING",
                    "description": "Kullanicinin ekranla ilgili sorusu. Ornek: 'Bu hatayi oku', 'Ekranda ne var?'"
                },
                "target": {
                    "type": "STRING",
                    "description": "Su an sadece active_window desteklenir."
                }
            },
            "required": ["query"]
        }
    },
    {
        "name": "save_memory",
        "description": "Kullanıcı hakkında önemli bilgiyi kalıcı belleğe kaydeder. İsim, tercihler, projeler vb. duyunca sessizce çağır.",
        "parameters": {
            "type": "OBJECT",
            "properties": {
                "category": {
                    "type": "STRING",
                    "description": "identity | preferences | projects | notes"
                },
                "key":   {"type": "STRING", "description": "Kısa anahtar (örn. 'name')"},
                "value": {"type": "STRING", "description": "Değer (İngilizce)"}
            },
            "required": ["category", "key", "value"]
        }
    },
    {
        "name": "delete_memory",
        "description": (
            "Kalici hafizadaki bir kaydi siler. "
            "Kullanici 'bunu hafizandan kaldir', 'unut', 'sil' gibi bir sey derse kullan. "
            "Mumkunse category ve key ile sil; emin degilsen match_text ile ilgili kaydi bulup kaldir."
        ),
        "parameters": {
            "type": "OBJECT",
            "properties": {
                "category": {
                    "type": "STRING",
                    "description": "Kaydin kategorisi. Ornek: notes | identity | preferences | projects"
                },
                "key": {
                    "type": "STRING",
                    "description": "Silinecek anahtar. Ornek: claude_limit_refresh"
                },
                "match_text": {
                    "type": "STRING",
                    "description": "Kaydi bulmak icin kullanilacak dogal dil parcasi. Ornek: 'claude ai limit yenilenmesi'"
                }
            }
        }
    },
    {
        "name": "send_whatsapp_message",
        "description": (
            "WhatsApp Desktop veya WhatsApp Web üzerinden mesaj taslağı açar veya mesajı gönderir. "
            "Kişi adı veya telefon numarasıyla çalışabilir. "
            "Telefon numarası verilmemişse kişi adını önce kayıtlı WhatsApp kişileri ve içe aktarılan telefon rehberinde ara. "
            "Kullanıcı 'gönder', 'yolla', 'ile', 'hemen gönder' gibi açık bir gönderme niyeti söylüyorsa "
            "ekstra onay istemeden send_now=true kullan. "
            "Yalnızca 'hazırla', 'taslak aç', 'yaz ama gönderme' diyorsa send_now=false kullan."
        ),
        "parameters": {
            "type": "OBJECT",
            "properties": {
                "recipient_name": {
                    "type": "STRING",
                    "description": "Kişi adı. Örn: 'Anne', 'Ahmet', 'Ece'"
                },
                "phone_number": {
                    "type": "STRING",
                    "description": "Uluslararası telefon numarası. Örn: +905551112233"
                },
                "message": {
                    "type": "STRING",
                    "description": "Gönderilecek mesaj içeriği"
                },
                "app_target": {
                    "type": "STRING",
                    "description": "desktop | web | auto. Varsayılan auto, tercihen desktop."
                },
                "send_now": {
                    "type": "BOOLEAN",
                    "description": "true ise sohbet açıldıktan sonra mesajı otomatik gönderir"
                }
            },
            "required": ["message"]
        }
    },
    {
        "name": "save_whatsapp_contact",
        "description": (
            "Sık kullanılan bir WhatsApp kişisini adı ve telefon numarasıyla kalıcı belleğe kaydeder. "
            "Kullanıcı bir kişiyi 'annem', 'Ahmet', 'iş ortağım' gibi tekrar kullanılacak şekilde tanımladığında kullan."
        ),
        "parameters": {
            "type": "OBJECT",
            "properties": {
                "display_name": {
                    "type": "STRING",
                    "description": "Kaydedilecek kişi adı. Örn: 'Annem', 'Ahmet'"
                },
                "phone_number": {
                    "type": "STRING",
                    "description": "Uluslararası telefon numarası. Örn: +905551112233"
                },
                "aliases": {
                    "type": "STRING",
                    "description": "Virgülle ayrılmış alternatif hitaplar. Örn: 'anne, annem, mom'"
                }
            },
            "required": ["display_name", "phone_number"]
        }
    },
    {
        "name": "system_control",
        "description": (
            "Bilgisayarı kontrol eder: ses açma/kısma/susturma/yüzde ayarlama, ekran parlaklığı, "
            "medya oynat/duraklat/sonraki/önceki, pencereleri küçültme (masaüstünü göster), aktif pencereyi kapatma, "
            "pencere değiştirme, ekranı kilitleme, ekran görüntüsü alma ve çalışan uygulamayı kapatma (close_app)."
        ),
        "parameters": {
            "type": "OBJECT",
            "properties": {
                "action": {
                    "type": "STRING",
                    "description": (
                        "volume_up | volume_down | volume_mute | volume_set | "
                        "brightness_up | brightness_down | brightness_set | "
                        "media_play_pause | media_next | media_prev | "
                        "minimize_all | close_window | switch_window | lock_screen | screenshot | close_app"
                    )
                },
                "value": {
                    "type": "STRING",
                    "description": "Opsiyonel değer (örn. yüzde '50' veya kapatılacak uygulama adı 'Spotify')"
                }
            },
            "required": ["action"]
        }
    },
    {
        "name": "ui_control",
        "description": (
            "Aktif pencerede klavye kısayolu, tuş basımı, Türkçe metin yazma veya sayfa kaydırma yapar. "
            "Örn: yeni sekme aç (ctrl+t), sekmeyi kapat (ctrl+w), kopyala (ctrl+c), yapıştır (ctrl+v), "
            "geri al (ctrl+z), kaydet (ctrl+s), aşağı/yukarı kaydır, metin yaz."
        ),
        "parameters": {
            "type": "OBJECT",
            "properties": {
                "action": {
                    "type": "STRING",
                    "description": "hotkey | press | type_text | scroll"
                },
                "keys": {
                    "type": "STRING",
                    "description": "Kısayol veya tuş adı. Örn: 'ctrl+t', 'ctrl+w', 'enter', 'escape', 'f5'"
                },
                "text": {
                    "type": "STRING",
                    "description": "type_text için yazılacak metin"
                },
                "amount": {
                    "type": "NUMBER",
                    "description": "scroll için miktar (yukarı pozitif örn. 500, aşağı negatif örn. -500)"
                }
            },
            "required": ["action"]
        }
    },
    {
        "name": "find_and_open",
        "description": (
            "Bilgisayarda (Masaüstü, İndirilenler, Belgeler, Resimler, Videolar, Müzik veya belirtilen disk/klasörde) "
            "herhangi bir dosya veya klasörü adıyla arar ve isterse doğrudan açar."
        ),
        "parameters": {
            "type": "OBJECT",
            "properties": {
                "query": {
                    "type": "STRING",
                    "description": "Aranacak dosya veya klasör adı. Örn: 'rapor.pdf', 'deneme', 'fatura'"
                },
                "open_first": {
                    "type": "BOOLEAN",
                    "description": "true ise ilk eşleşeni doğrudan açar; false ise sadece listeler."
                },
                "search_root": {
                    "type": "STRING",
                    "description": "Opsiyonel arama kökü (örn. 'C:\\Users', 'D:\\')"
                }
            },
            "required": ["query"]
        }
    },
    {
        "name": "create_folder",
        "description": "Masaüstü, İndirilenler, Belgeler veya belirtilen konumda yeni klasör oluşturur.",
        "parameters": {
            "type": "OBJECT",
            "properties": {
                "name": {
                    "type": "STRING",
                    "description": "Oluşturulacak klasör adı"
                },
                "location": {
                    "type": "STRING",
                    "description": "Konum: 'desktop' | 'downloads' | 'documents' veya tam klasör yolu"
                }
            },
            "required": ["name"]
        }
    },
    {
        "name": "island_control",
        "description": (
            "TwoCode Dynamic Island (Ada) durumunu okur ve ada içindeki özellikleri doğrudan kontrol eder: "
            "halihazırda açık/duraklatılmış medyayı oynatma/devam ettirme/duraklatma/geçme/sorma "
            "(şarkıyı devam ettir, müziği durdur, sonraki şarkı, şu an ne çalıyor), "
            "ada sekmelerini açma (home, music, weather, timer, focus, drop, notes, calendar, health), "
            "odak/pomodoro sayacını başlatma/duraklatma/sıfırlama, görev (to-do) listesini okuma/ekleme ve not ekleme."
        ),
        "parameters": {
            "type": "OBJECT",
            "properties": {
                "action": {
                    "type": "STRING",
                    "description": (
                        "get_state | media_play | media_pause | media_next | media_prev | media_status | "
                        "open_tab | focus_start | focus_pause | focus_reset | todo_list | todo_add | note_add"
                    )
                },
                "value": {
                    "type": "STRING",
                    "description": "Opsiyonel değer (örn. sekme adı 'music'/'notes'/'calendar'/'focus'/'weather', görev veya not metni)"
                }
            },
            "required": ["action"]
        }
    },
    {
        "name": "local_rag_query",
        "description": (
            "Kullanıcının Masaüstü, Belgeler veya İndirilenler klasörlerindeki yerel metin/not/kod belgeleri içinde "
            "anlamsal RAG araması yapar ve en alakalı bilgi parçalarını getirir."
        ),
        "parameters": {
            "type": "OBJECT",
            "properties": {
                "query": {
                    "type": "STRING",
                    "description": "Belgelerde aranacak soru veya anahtar kelimeler"
                },
                "scope": {
                    "type": "STRING",
                    "description": "Arama kapsamı: 'all' | 'desktop' | 'documents' | 'downloads' veya dosya/klasör yolu"
                },
                "detail": {
                    "type": "STRING",
                    "description": "Özet düzeyi: 'concise' (varsayılan, token tasarruflu) | 'deep' (kullanıcı detay isterse)"
                }
            },
            "required": ["query"]
        }
    }
]
