import fetch from 'node-fetch';
import { loadEPUB } from 'jw-epub-parser/dist/node/index.js';

const fetchIssueData = (issue) => {
	return new Promise((resolve) => {
		if (issue.hasEPUB) {
			const epubFile = issue.hasEPUB[0].file;
			const epubUrl = epubFile.url;
			const epubModifiedDate = epubFile.modifiedDatetime;

			loadEPUB({ url: epubUrl }).then((epubData) => {
				const obj = {
					issueDate: issue.issueDate,
					modifiedDateTime: epubModifiedDate,
					...epubData,
				};
				resolve(obj);
			});
		}
	});
};

const fetchData = async (language) => {
	const mergedSources = [];
	let notFound = false;

	// get current issue
	const today = new Date();
	const day = today.getDay();
	const diff = today.getDate() - day + (day === 0 ? -6 : 1);
	const weekDate = new Date(today.setDate(diff));
	const currentMonth = weekDate.getMonth() + 1;
	const monthOdd = currentMonth % 2 === 0 ? false : true;
	let monthMwb = monthOdd ? currentMonth : currentMonth - 1;
	let currentYear = weekDate.getFullYear();

	const issues = [];

	do {
		const issueDate = currentYear + String(monthMwb).padStart(2, '0');
		const url =
			process.env.JW_CDN +
			new URLSearchParams({
				langwritten: language,
				pub: 'mwb',
				fileformat: 'epub',
				output: 'json',
				issue: issueDate,
			});

		const res = await fetch(url);

		if (res.status === 200) {
			const result = await res.json();
			const hasEPUB = result.files[language].EPUB;

			issues.push({ issueDate, currentYear, language, hasEPUB: hasEPUB });
		}

		if (res.status === 404) {
			notFound = true;
		}

		// assigning next issue
		monthMwb = monthMwb + 2;
		if (monthMwb === 13) {
			monthMwb = 1;
			currentYear++;
		}
	} while (notFound === false);

	if (issues.length > 0) {
		const fetchSource1 = fetchIssueData(issues[0]);
		const fetchSource2 = issues.length > 1 ? fetchIssueData(issues[1]) : Promise.resolve({});
		const fetchSource3 = issues.length > 2 ? fetchIssueData(issues[2]) : Promise.resolve({});
		const fetchSource4 = issues.length > 3 ? fetchIssueData(issues[3]) : Promise.resolve({});

		const allData = await Promise.all([fetchSource1, fetchSource2, fetchSource3, fetchSource4]);

		for (let z = 0; z < allData.length; z++) {
			const tempObj = allData[z];
			if (tempObj.issueDate) {
				mergedSources.push(tempObj);
			}
		}
	}

	return mergedSources;
};

export const getSchedules = async (req, res, next) => {
	try {
		let { language } = req.params;
		language = language.toUpperCase();

		const mergedSources = await fetchData(language);

		if (mergedSources.length > 0) {
			res.locals.type = 'info';
			res.locals.message = 'updated schedules fetched from jw.org';
			res.status(200).json(mergedSources);
		} else {
			res.locals.type = 'warn';
			res.locals.message = 'schedules could not be fetched because language is invalid or not available yet';
			res.status(404).json({ message: 'FETCHING_FAILED' });
		}
	} catch (err) {
		next(err);
	}
};
