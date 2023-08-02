var http = require('http');
http.createServer(function (req, res) {
    console.log(`Just got a request at ${req.url}!`)
    res.write('Yo!');
    res.end();
}).listen(process.env.PORT || 3000);

const axios = require("axios");
const { Client } = require("@notionhq/client");

const notion = new Client({ auth: process.env.NOTION_KEY });

let processRunning = false;
let queryTerm = "";
let filmArray = [];

async function getDetails() {
  console.log("Getting film details...");

  for (let films of filmArray) {
    await axios
      .get(films.searchTerm)
      .then((response) => {
        films.databaseID = response.data.results[0].id;
      })
      .catch((err) => {
        console.log(err);
      });
    await axios
      .get(
        "https://api.themoviedb.org/3/movie/" +
          films.databaseID +
          "?api_key=0af688e78f344af41861110877187086&language=en-US"
      )
      .then((response) => {
        const genresArray = [];

        for (let genre of response.data.genres) {
          const typeObj = {
            name: genre.name,
          };
          genresArray.push(typeObj);
        }

        const posterURL = `https://www.themoviedb.org/t/p/original/${response.data.backdrop_path}`;

        const imdbURL = `https://www.imdb.com/title/${response.data.imdb_id}`;

        (films.title = response.data.title),
          (films.release = response.data.release_date),
          (films.genres = genresArray),
          (films.tagline = response.data.tagline),
          (films.overview = response.data.overview),
          (films.poster = posterURL),
          (films.runtime = response.data.runtime),
          (films.imdb = imdbURL);
      })
      .catch((err) => {
        console.log(err);
      });
    const crew = await axios
        .get(
          "https://api.themoviedb.org/3/movie/" +
            films.databaseID +
            "/credits?api_key=0af688e78f344af41861110877187086&language=en-US"
        )
        .then((response) => {
          const directorList = response.data.crew.filter(
            ({ job }) => job === "Director"
          );
          const directorsArray = [];
          for (let directors of directorList) {
            const typeObj = {
              name: directors.name,
            };
            directorsArray.push(typeObj);
          }

          const composerList = response.data.crew.filter(
            ({ job }) => job === "Original Music Composer"
          );
          const composersArray = [];
          for (let composers of composerList) {
            const typeObj = {
              name: composers.name,
            };
            composersArray.push(typeObj);
          }
          films.directors = directorsArray;
          films.composers = composersArray;
        });
  }
  console.log(filmArray)
  notionUpdate();
  } 


async function notionUpdate() {
  for (let films of filmArray) {
    console.log("Sending " + films.title + " to Notion...");
    const databaseId = process.env.NOTION_DATABASE_ID;
    const pageId = films.notionID;
    let response = await notion.pages.update({
      page_id: pageId,
      cover: {
        type: "external",
        external: {
          url: films.poster,
        },
      },
      properties: {
        Name: {
          title: [
            {
              text: {
                content: films.title,
              },
            },
          ],
        },
        Tagline: {
          rich_text: [
            {
              type: "text",
              text: {
                content: films.tagline,
              },
            },
          ],
        },
        Minutes: {
          number: films.runtime,
        },
        Overview: {
          rich_text: [
            {
              type: "text",
              text: {
                content: films.overview,
              },
            },
          ],
        },
        IMDb: {
          url: films.imdb,
        },
        Genre: { multi_select: films.genres },
        Director: { multi_select: films.directors },
        Composer: { multi_select: films.composers },
      },
    });
    if (films.release != "") {
    response = await notion.pages.update({
      page_id: pageId,
      properties: {
        "Release Date": {
          date: {
            start: films.release,
          },
        }
      }
    })
    }
  }
  processRunning = false;
  filmArray = []
  console.log(filmArray)
  console.log("Completed!")
}

// Start Here, searches Notion for films and get the Notion page + film name
async function newNotionFilms() {
  if (processRunning === true) {
    console.log("process already running... skipped");
    return;
  } else {
    // Look in Notion for Movies containing ; in the title

    const databaseId = process.env.NOTION_DATABASE_ID;
    const response = await notion.databases.query({
      database_id: databaseId,
      filter: {
        property: "Name",
        rich_text: {
          contains: ";",
        },
      },
      sorts: [
        {
          timestamp: "created_time",
          direction: "descending",
        },
      ],
    });

    if (response.results.length === 0) {
      console.log("no search results!");
    } else {
      processRunning = true;
      console.log("triggered code..., process running = " + processRunning);

      let movieTitle = "";

      // Iterate through search results object
      for (let notionPages of response.results) {
        // Returns the Movie Title as a string from the response and removes the last character, which is the ;
        movieTitle = notionPages.properties.Name.title[0].plain_text.slice(
          0,
          -1
        );

        // Process movie title if it includes year and include both in search term

        if (movieTitle.includes(" y:")) {
          let fields = movieTitle.split(" y:");

          movieTitle = fields[0];
          let movieYear = fields[1];
          queryTerm =
            "https://api.themoviedb.org/3/search/movie?api_key=0af688e78f344af41861110877187086&language=en-US&query=" +
            movieTitle +
            "&year=" +
            movieYear;
        } else {
          queryTerm =
            "https://api.themoviedb.org/3/search/movie?api_key=0af688e78f344af41861110877187086&language=en-US&query=" +
            movieTitle;
        }

        // get the Notion page ID

        const notionPageID = notionPages.id;

        // build an Object containing all data from Notion so far

        const notionData = {
          filmName: movieTitle,
          searchTerm: queryTerm,
          notionID: notionPageID,
        };
        console.log("Searching for: " + notionData.filmName);

        // push film Data into a Notion Array

        filmArray.push(notionData);
      }

      // Returns the Notion Page ID

      // Run and TMDB search for the movie title

      getDetails();
    }
  }
}
//setInterval(
// newNotionFilms,
//  8000);
newNotionFilms();


