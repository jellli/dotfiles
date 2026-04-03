function Jili.float_terminal(cmd, opts)
	opts = opts or {}
	local width = opts.width or 0.9
	local height = opts.height or 0.9

	if width <= 1 then
		width = math.floor(vim.o.columns * width)
	end
	if height <= 1 then
		height = math.floor(vim.o.lines * height)
	end

	local row = math.floor((vim.o.lines - height) / 2)
	local col = math.floor((vim.o.columns - width) / 2)
	local border = vim.g.border or "rounded"

	local buf = vim.api.nvim_create_buf(false, true)
	local win = vim.api.nvim_open_win(buf, true, {
		relative = "editor",
		width = width,
		height = height,
		row = row,
		col = col,
		style = "minimal",
		border = border,
	})

	vim.fn.jobstart(cmd, {
		term = true,
		on_exit = function()
			if vim.api.nvim_buf_is_valid(buf) then
				vim.api.nvim_buf_delete(buf, { force = true })
			end
		end,
	})
	vim.cmd("startinsert")

	vim.keymap.set("t", "q", function()
		vim.api.nvim_win_close(win, true)
	end, { buffer = buf })
end

function Jili.lazygit()
	Jili.float_terminal("lazygit")
end
