--- Create an augroup
--- @param name string
--- @return integer
local function create_augroup(name)
	return vim.api.nvim_create_augroup(name, { clear = true })
end

vim.api.nvim_create_autocmd("FileType", {
	group = create_augroup("CloseWithQ"),
	pattern = { "qf" },
	callback = function()
		vim.keymap.set("n", "q", "<cmd>close<cr>", { buffer = true })
	end,
})

vim.api.nvim_create_autocmd("BufReadPost", {
	group = create_augroup("LastLOC"),
	callback = function(event)
		local exclude = { "gitcommit" }
		local buf = event.buf
		if vim.tbl_contains(exclude, vim.bo[buf].filetype) or vim.b[buf].neovim_last_loc then
			return
		end
		vim.b[buf].neovim_last_loc = true
		local mark = vim.api.nvim_buf_get_mark(buf, '"')
		local lcount = vim.api.nvim_buf_line_count(buf)
		if mark[1] > 0 and mark[1] <= lcount then
			pcall(vim.api.nvim_win_set_cursor, 0, mark)
		end
	end,
})

vim.api.nvim_create_autocmd("User", {
	pattern = "MiniFilesActionRename",
	callback = function(event)
		Snacks.rename.on_rename_file(event.data.from, event.data.to)
	end,
})
