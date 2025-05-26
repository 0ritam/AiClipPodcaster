from pytubefix import YouTube
from pytubefix.cli import on_progress

url1= "https://www.youtube.com/watch?v=MbaZ93RS-uw"
url2 = "https://www.youtube.com/watch?v=MfHLaSB-Pxs"
url3 = "https://www.youtube.com/watch?v=zCYQEHBfYuU"
url4 = "https://www.youtube.com/watch?v=7HhIFpO9At8"

yt = YouTube(url4, on_progress_callback=on_progress)
print(yt.title)

ys = yt.streams.get_highest_resolution()
ys.download()