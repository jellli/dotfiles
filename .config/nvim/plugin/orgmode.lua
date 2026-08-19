local later = require("queue").later

later(function()
	vim.pack.add({
		"https://github.com/nvim-orgmode/orgmode",
	})

	require("orgmode").setup({
		org_agenda_files = "~/orgfiles/**/*",
		org_default_notes_file = "~/orgfiles/refile.org",
	})

	Jili.autocmd("FileType", {
		pattern = "org",
		callback = function()
			vim.lsp.enable("org")
		end,
	})
end)
